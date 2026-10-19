import type { ChainName } from "./contracts/types";

/** The same providers and depths the contract uses (contracts/ballast.py CHAINS). A test read asks the first that answers; the validators ask all. */
const RPCS: Record<ChainName, { id: number; depth: number; urls: string[] }> = {
  ethereum: { id: 1, depth: 32, urls: ["https://mainnet.gateway.tenderly.co", "https://rpc.mevblocker.io", "https://eth-mainnet.public.blastapi.io"] },
  base: { id: 8453, depth: 120, urls: ["https://mainnet.base.org", "https://base.gateway.tenderly.co", "https://base-mainnet.public.blastapi.io"] },
};

export interface TestInput {
  reserves: { chain: ChainName; asset: string; holder: string; label: string }[];
  liabChain: ChainName;
  liabToken: string;
  unitNum: number;
  unitDen: number;
}

export interface TestLine {
  label: string;
  chain: ChainName;
  raw: string;
  decimals: number;
  value: bigint;
}

export interface TestResult {
  lines: TestLine[];
  reserves: bigint;
  supply: bigint;
  liabDecimals: number;
  ratioBps: number;
}

async function batch(url: string, calls: [string, unknown[]][]): Promise<any[] | null> {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(calls.map(([method, params], id) => ({ jsonrpc: "2.0", id, method, params }))),
      signal: AbortSignal.timeout(12000),
    });
    const arr = await res.json();
    if (!Array.isArray(arr)) return null;
    const out: any[] = [];
    for (const x of arr) {
      if (x.error || x.result == null) return null;
      out[x.id] = x.result;
    }
    return out.length === calls.length ? out : null;
  } catch {
    return null;
  }
}

async function readChain(chain: ChainName, calls: [string, unknown[]][], pinned?: number): Promise<{ pin: number; out: any[] }> {
  const { id, depth, urls } = RPCS[chain];
  for (const u of urls) {
    const head = await batch(u, [["eth_blockNumber", []], ["eth_chainId", []]]);
    if (!head || parseInt(head[1], 16) !== id) continue;
    const pin = pinned ?? parseInt(head[0], 16) - depth;
    const pn = "0x" + pin.toString(16);
    const out = await batch(u, calls.map(([m, p]) => [m, [...p, pn]] as [string, unknown[]]));
    if (out) return { pin, out };
  }
  throw new Error(`None of the ${chain} providers answered this browser (some block browser requests). The validators read them server side, so this is only the preview that failed.`);
}

const pad = (a: string) => "0".repeat(24) + a;

/** A preview of what the validators will read, from this browser. Nothing is sent on-chain. */
export async function testRead(input: TestInput): Promise<TestResult> {
  const liab = input.liabToken;
  // every read of a chain is at the same pinned block, as the validators do it; reading each piece at its own head would not add up
  const pins: Partial<Record<ChainName, number>> = {};
  const at = async (chain: ChainName, calls: [string, unknown[]][]) => {
    const r = await readChain(chain, calls, pins[chain]);
    pins[chain] = r.pin;
    return r;
  };
  const supplyCalls = await at(input.liabChain, [
    ["eth_call", [{ to: "0x" + liab, data: "0x18160ddd" }]],
    ["eth_call", [{ to: "0x" + liab, data: "0x313ce567" }]],
  ]);
  const supply = BigInt(supplyCalls.out[0]);
  const ldec = Number(BigInt(supplyCalls.out[1]));
  if (supply <= BigInt(0)) throw new Error("The liability token has no supply.");
  const lines: TestLine[] = [];
  for (const r of input.reserves) {
    const calls: [string, unknown[]][] =
      r.asset === "native"
        ? [["eth_getBalance", ["0x" + r.holder]]]
        : [["eth_call", [{ to: "0x" + r.asset, data: "0x70a08231" + pad(r.holder) }]], ["eth_call", [{ to: "0x" + r.asset, data: "0x313ce567" }]]];
    const { out } = await at(r.chain, calls);
    const raw = BigInt(out[0]);
    const dec = r.asset === "native" ? 18 : Number(BigInt(out[1]));
    const value = (raw * BigInt(10) ** BigInt(ldec) * BigInt(input.unitNum)) / (BigInt(10) ** BigInt(dec) * BigInt(input.unitDen));
    lines.push({ label: r.label, chain: r.chain, raw: raw.toString(), decimals: dec, value });
  }
  const reserves = lines.reduce((s, l) => s + l.value, BigInt(0));
  return { lines, reserves, supply, liabDecimals: ldec, ratioBps: Number((reserves * BigInt(10000)) / supply) };
}
