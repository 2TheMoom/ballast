import { createClient } from "genlayer-js";
import { getGenLayerChain } from "../genlayer/chains";
import { getEthereumProvider, prepareWalletForWrites } from "../genlayer/client";
import { decodeAttestation, decodeChallenge, decodeHistory, decodeLatest, decodeMonitor } from "./decode";
import { failedReceiptMessage, isContractRefusal, refusalReason } from "../receipt";
import type { Attestation, Challenge, HistoryPoint, Latest, Monitor, WriteProgress, WriteStage } from "./types";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface RegisterArgs {
  id: string;
  name: string;
  liabChain: string;
  liabToken: string;
  unitNum: number;
  unitDen: number;
  minRatioBps: number;
  maxAge: number;
  reserves: { chain: string; asset: string; holder: string; label: string }[];
}

export interface ChallengeArgs {
  id: string;
  reason: string;
  evidence: string;
  statement: string;
  probeChain: string;
  probeAsset: string;
  probeHolder: string;
}

interface WriteSpec {
  fn: string;
  args: unknown[];
  /** the read-back that must hold once the transaction is ACCEPTED */
  confirm: () => Promise<boolean>;
  /** the read-back that must still hold once it is FINALIZED */
  finalConfirm: () => Promise<boolean>;
  /** attest runs the full validator read, which a simulation would only repeat */
  simulate?: boolean;
  onProgress?: (p: WriteProgress) => void;
}

/**
 * Ballast contract client. Reads use an account-free client. Writes use a second client that carries the injected wallet provider.
 *
 * A write is only reported as done after: a simulation (so a refusal shows the contract's own reason before anything is sent),
 * acceptance by the validators, a successful GenVM result, the expected state read back, and then FINALIZED with the state still
 * showing it. Until finalization a write is "recorded, not final", and other contracts only read FINALIZED state.
 */
class Ballast {
  private address: `0x${string}`;
  private readClient: any;
  private writeClient: any = null;
  private connectedFor: string | null = null;
  private account?: string | null;
  private rpcUrl?: string;

  constructor(address: string, account?: string | null, rpcUrl?: string) {
    this.address = address as `0x${string}`;
    this.rpcUrl = rpcUrl;
    this.account = account;
    const config: any = { chain: getGenLayerChain() };
    if (rpcUrl) config.endpoint = rpcUrl;
    this.readClient = createClient(config);
  }

  private async writer(): Promise<any> {
    if (!this.account) throw new Error("Wallet not connected. Connect your wallet first.");
    const provider = getEthereumProvider();
    if (!provider) throw new Error("No wallet found. Install MetaMask to sign transactions.");
    if (!this.writeClient || this.connectedFor !== this.account) {
      const config: any = { chain: getGenLayerChain(), account: this.account as `0x${string}`, provider };
      if (this.rpcUrl) config.endpoint = this.rpcUrl;
      const client = createClient(config);
      await prepareWalletForWrites(provider);
      this.writeClient = client;
      this.connectedFor = this.account;
    }
    return this.writeClient;
  }

  // ---- reads ---------------------------------------------------------------------------------

  private read(functionName: string, args: unknown[] = []): Promise<any> {
    return this.readClient.readContract({ address: this.address, functionName, args });
  }

  async getMonitorIds(): Promise<string[]> {
    const r: any = await this.read("get_monitor_ids");
    return Array.isArray(r) ? r.map(String) : [];
  }

  async getMonitor(id: string): Promise<Monitor | null> {
    try {
      return decodeMonitor(await this.read("get_monitor", [id]));
    } catch (error) {
      if (isContractRefusal(error)) return null;
      throw error;
    }
  }

  async getLatest(id: string): Promise<Latest> {
    return decodeLatest(await this.read("get_latest", [id]));
  }

  async getAttestation(id: string, seq: number): Promise<Attestation | null> {
    try {
      return decodeAttestation(await this.read("get_attestation", [id, seq]));
    } catch (error) {
      if (isContractRefusal(error)) return null;
      throw error;
    }
  }

  async getHistory(id: string): Promise<HistoryPoint[]> {
    return decodeHistory(await this.read("get_history", [id]));
  }

  async getChallenge(id: string, n: number): Promise<Challenge | null> {
    try {
      return decodeChallenge(await this.read("get_challenge", [id, n]), n);
    } catch (error) {
      if (isContractRefusal(error)) return null;
      throw error;
    }
  }

  async txStatus(hash: string): Promise<{ status: string; exec: string; receipt: any }> {
    const r: any = await this.readClient.getTransaction({ hash });
    return { status: String(r?.statusName ?? ""), exec: String(r?.txExecutionResultName ?? ""), receipt: r };
  }

  // ---- the write path -------------------------------------------------------------------------

  private async until(pred: () => Promise<boolean>, tries: number, what: string): Promise<void> {
    for (let i = 0; i < tries; i++) {
      if (await pred().catch(() => false)) return;
      await sleep(5000);
    }
    throw new Error(what);
  }

  private async submitWrite(spec: WriteSpec): Promise<string> {
    const progress = (stage: WriteStage, txHash?: string, message?: string) => spec.onProgress?.({ stage, txHash, message });
    const client = await this.writer();
    const request = { address: this.address, functionName: spec.fn, args: spec.args };

    progress("signing");
    if (spec.simulate !== false && typeof client.simulateWriteContract === "function") {
      try {
        await client.simulateWriteContract(request);
      } catch (error) {
        const reason = refusalReason(error);
        if (reason) throw new Error(reason);
        // no contract reason in the error (a network blip): let the real send decide
      }
    }
    let txHash: string;
    try {
      txHash = await client.writeContract({ ...request, value: BigInt(0) });
    } catch (error: any) {
      console.error(`Error calling ${spec.fn}:`, error);
      const rejected = error?.code === 4001 || /reject|denied/i.test(String(error?.message ?? ""));
      throw new Error(rejected ? "You rejected the transaction in your wallet." : `Failed to submit the ${spec.fn} transaction. Please try again.`);
    }
    progress("submitted", txHash);

    let receipt: any;
    try {
      receipt = await client.waitForTransactionReceipt({ hash: txHash, status: "ACCEPTED" as any, retries: 90, interval: 5000 });
    } catch (error) {
      console.error(`Error confirming ${spec.fn} transaction:`, error);
      throw new Error(`Transaction ${txHash} was submitted but is not accepted yet. It may still complete: check the explorer.`);
    }
    const failure = failedReceiptMessage(receipt, spec.fn, txHash);
    if (failure) throw new Error(failure);
    progress("accepted", txHash);

    await this.until(spec.confirm, 24, "The transaction was accepted but the result is not showing yet. Check the explorer before retrying.");
    progress("confirmed", txHash);

    void this.awaitFinality(txHash, spec, progress);
    return txHash;
  }

  private async awaitFinality(txHash: string, spec: WriteSpec, progress: (stage: WriteStage, txHash?: string, message?: string) => void): Promise<void> {
    let receipt: any = null;
    for (let i = 0; i < 8 && !receipt; i++) {
      try {
        receipt = await this.readClient.waitForTransactionReceipt({ hash: txHash, status: "FINALIZED" as any, retries: 400, interval: 10000 });
      } catch {
        await sleep(15000);
      }
    }
    if (!receipt) {
      progress("failed", txHash, `Transaction ${txHash} has not finalized yet. It is recorded but not final: check the explorer before relying on it.`);
      return;
    }
    const failure = failedReceiptMessage(receipt, spec.fn, txHash);
    if (failure) {
      progress("failed", txHash, failure);
      return;
    }
    try {
      await this.until(spec.finalConfirm, 6, "x");
    } catch {
      progress("failed", txHash, `Transaction ${txHash} finalized but the state does not show its result. Check the explorer.`);
      return;
    }
    progress("finalized", txHash);
  }

  /** Public so a page that was reloaded can watch a recorded write until it finalizes. */
  watchFinality(txHash: string, onProgress: (p: WriteProgress) => void): Promise<void> {
    return this.awaitFinality(txHash, { fn: "write", args: [], confirm: async () => true, finalConfirm: async () => true }, (stage, h, message) => onProgress({ stage, txHash: h, message }));
  }

  // ---- writes ---------------------------------------------------------------------------------

  register(a: RegisterArgs, onProgress?: (p: WriteProgress) => void) {
    const args = [a.id, a.name, a.liabChain, a.liabToken, a.unitNum, a.unitDen, a.minRatioBps, a.maxAge, JSON.stringify(a.reserves)];
    const known = async () => (await this.getMonitor(a.id)) !== null;
    return this.submitWrite({ fn: "register", args, confirm: known, finalConfirm: known, onProgress });
  }

  async attest(id: string, onProgress?: (p: WriteProgress) => void) {
    const before = (await this.getMonitor(id))?.count ?? 0;
    const recorded = async () => ((await this.getMonitor(id))?.count ?? 0) > before;
    return this.submitWrite({ fn: "attest", args: [id], confirm: recorded, finalConfirm: recorded, simulate: false, onProgress });
  }

  async challenge(a: ChallengeArgs, onProgress?: (p: WriteProgress) => void) {
    const before = (await this.getMonitor(a.id))?.openChallenges ?? 0;
    const open = async () => ((await this.getMonitor(a.id))?.openChallenges ?? 0) > before;
    const args = [a.id, a.reason, a.evidence, a.statement, a.probeChain, a.probeAsset, a.probeHolder];
    // a later attestation may clear the challenge before finality, so the final check is only that it exists
    const exists = async () => ((await this.getMonitor(a.id)) ?? null) !== null;
    return this.submitWrite({ fn: "challenge", args, confirm: open, finalConfirm: exists, onProgress });
  }

  async addReserve(id: string, r: { chain: string; asset: string; holder: string; label: string }, onProgress?: (p: WriteProgress) => void) {
    const before = (await this.getMonitor(id))?.version ?? 0;
    const bumped = async () => ((await this.getMonitor(id))?.version ?? 0) > before;
    return this.submitWrite({ fn: "add_reserve", args: [id, r.chain, r.asset, r.holder, r.label], confirm: bumped, finalConfirm: bumped, onProgress });
  }

  async scheduleRemoval(id: string, r: { chain: string; asset: string; holder: string }, onProgress?: (p: WriteProgress) => void) {
    const pending = async () => !!(await this.getMonitor(id))?.pending.some((p) => p.chain === r.chain && p.asset === r.asset && p.holder === r.holder);
    return this.submitWrite({ fn: "schedule_removal", args: [id, r.chain, r.asset, r.holder], confirm: pending, finalConfirm: pending, onProgress });
  }

  async cancelRemoval(id: string, r: { chain: string; asset: string; holder: string }, onProgress?: (p: WriteProgress) => void) {
    const gone = async () => !(await this.getMonitor(id))?.pending.some((p) => p.chain === r.chain && p.asset === r.asset && p.holder === r.holder);
    return this.submitWrite({ fn: "cancel_removal", args: [id, r.chain, r.asset, r.holder], confirm: gone, finalConfirm: gone, onProgress });
  }

  async applyRemoval(id: string, r: { chain: string; asset: string; holder: string }, onProgress?: (p: WriteProgress) => void) {
    const removed = async () => !(await this.getMonitor(id))?.reserves.some((x) => x.chain === r.chain && x.asset === r.asset && x.holder === r.holder);
    return this.submitWrite({ fn: "apply_removal", args: [id, r.chain, r.asset, r.holder], confirm: removed, finalConfirm: removed, onProgress });
  }
}

export default Ballast;
