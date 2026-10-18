// Live end to end run of Ballast and GateExample on Bradbury, against real Ethereum and Base data, with separate wallets.
//   BALLAST=0x.. RUN=v2 node scripts/e2e.mjs        writes scripts/e2e-log-<RUN>.json
//
// Scenarios (each its own monitor, run concurrently):
//   covered    WETH9's supply is its own ETH balance, so the ratio is exactly 100.00%: attested, then a GateExample acts on it
//   strict     the same data with a 101% floor: attested short, then a GateExample refuses
//   challenge  a covered monitor is challenged with a probe address: the gate refuses (disputed), a newer attestation shows the probe
//              and clears it, the gate acts again
//   twochains  reserves on Ethereum and Base against one liability: both chains read at their own pinned blocks
//   erc20      wstETH: stETH (an ERC-20 reserve) held by the wstETH contract against its supply
import { readFileSync, writeFileSync } from "fs";
import { WALLETS, clientFor, plain, read, reader, reasonOf, send, sleep, ts } from "./lib.mjs";

const B = process.env.BALLAST;
const RUN = process.env.RUN || Date.now().toString(36);
const WETH = "c02aaa39b223fe8d0a0e5c4f27ead9083c756cc2";
const BASE_WETH = "4200000000000000000000000000000000000006";
const WSTETH = "7f39c581f595b53c5cb19bd0b3f8da6c935e2ca0";
const STETH = "ae7ab96520de3a18e5e111b5eaab095312d7fe84";
const BEACON = "00000000219ab540356cbb839cbe05303d7705fa";
const clients = { registrant: clientFor("gl-test-1"), attester: clientFor("gl-test-2"), challenger: clientFor("gl-test-3") };
const addr = Object.fromEntries(Object.entries({ registrant: "gl-test-1", attester: "gl-test-2", challenger: "gl-test-3" }).map(([k, v]) => [k, WALLETS[v].address]));

const LOG = { run: RUN, ballast: B, started: new Date().toISOString(), gates: {}, events: [], results: {} };
const log = (scn, msg, extra) => {
  console.log(`[${ts()}] ${scn.padEnd(10)} ${msg}`);
  LOG.events.push({ t: new Date().toISOString(), scn, msg, ...(extra || {}) });
};
const lock = {};
const serial = (who, fn) => (lock[who] = (lock[who] || Promise.resolve()).then(fn, fn));
const tx = (scn, who, address, fn, args, label) =>
  serial(who, async () => {
    const r = await send(clients[who], address, fn, args);
    log(scn, `${label || fn} ${r.hash.slice(0, 12)} ${r.status} exec=${r.exec}`, { fn, hash: r.hash, exec: r.exec, status: r.status });
    return r;
  });

async function finalized(scn, hash, label) {
  const t0 = Date.now();
  for (let a = 0; a < 20; a++) {
    try {
      await reader.waitForTransactionReceipt({ hash, status: "FINALIZED", retries: 400, interval: 10000 });
      const m = ((Date.now() - t0) / 60000).toFixed(1);
      log(scn, `${label} FINALIZED ${m} min after the wait began`);
      return;
    } catch {
      await sleep(15000);
    }
  }
  throw new Error(`${scn}: ${label} did not finalize`);
}

const ok = (r) => (r.status === "ACCEPTED" || r.status === "FINALIZED") && r.exec === "FINISHED_WITH_RETURN";
async function attestUntil(scn, who, id) {
  for (let a = 1; a <= 8; a++) {
    const r = await tx(scn, who, B, "attest", [id], `attest #${a}`);
    if (ok(r)) return r;
    await sleep(20000);
  }
  throw new Error(`${scn}: no attestation was accepted for ${id}`);
}

// a deploy is a transaction from the registrant's wallet like any other, so it takes its turn in the same queue (two at once collide on the nonce)
function deployGate(scn, id) {
  return serial("registrant", async () => {
    const code = new Uint8Array(readFileSync("contracts/gate_example.py"));
    const hash = await clients.registrant.deployContract({ code, args: [B, id, 86400n] });
    const rec = await clients.registrant.waitForTransactionReceipt({ hash, status: "ACCEPTED", retries: 200, interval: 5000 });
    const address = rec.txDataDecoded?.contractAddress ?? rec.data?.contract_address;
    log(scn, `gate deployed for ${id}: ${address}`);
    LOG.gates[id] = address;
    return address;
  });
}

/** A gate action that must go through, or must be refused (simulated first for the contract's own reason, then sent so it is on chain). */
async function gateActs(scn, g, note) {
  const r = await tx(scn, "attester", g, "perform", [note], "gate.perform");
  if (!ok(r)) throw new Error(`${scn}: the gate should have acted but ended ${r.status} ${r.exec}`);
  return r;
}
async function gateRefuses(scn, g, expect) {
  let reason = "SIMULATION ACCEPTED";
  try {
    await clients.attester.simulateWriteContract({ address: g, functionName: "perform", args: ["should be refused"] });
  } catch (e) {
    reason = reasonOf(e);
  }
  if (reason === "SIMULATION ACCEPTED") throw new Error(`${scn}: the gate should have refused`);
  if (expect && !reason.includes(expect)) throw new Error(`${scn}: the gate refused for "${reason}", expected "${expect}"`);
  const r = await tx(scn, "attester", g, "perform", ["should be refused"], "gate.perform (refused)");
  if (ok(r)) throw new Error(`${scn}: the refused call was accepted`);
  log(scn, `gate refused: "${reason}"`, { reason });
  return reason;
}

const row = (chain, asset, holder, label) => ({ chain, asset, holder, label });
const register = (scn, id, name, liabChain, liabToken, minBps, rows, unit = [1, 1]) =>
  tx(scn, "registrant", B, "register", [id, name, liabChain, liabToken, unit[0], unit[1], minBps, 86400, JSON.stringify(rows)], "register");

// ------------------------------------------------------------------------------------------------------------------ scenarios

async function covered() {
  const scn = "covered";
  const id = `e2e-${RUN}-covered`;
  await register(scn, id, "WETH on Ethereum", "ethereum", WETH, 10000, [row("ethereum", "native", WETH, "WETH9 contract")]);
  const g = await deployGate(scn, id);
  const a = await attestUntil(scn, "attester", id);
  const att = await read(B, "get_attestation", [id, 1]);
  log(scn, `ratio ${att.ratio_bps} bps, covered=${att.covered}, ethereum block ${att.blocks.ethereum.number}`, { att });
  if (att.ratio_bps !== 10000 || !att.covered) throw new Error(`${scn}: WETH9 must be exactly 100.00%`);
  await finalized(scn, a.hash, "the attestation");
  await gateActs(scn, g, "WETH9 is fully backed");
  const st = await read(g, "get_state");
  if (Number(st.performed) !== 1) throw new Error(`${scn}: the gate did not record its action`);
  LOG.results.covered = { id, gate: g, ratio_bps: att.ratio_bps, block: att.blocks.ethereum, performed: st.performed };
}

async function strict() {
  const scn = "strict";
  const id = `e2e-${RUN}-strict`;
  await register(scn, id, "WETH, 101% floor", "ethereum", WETH, 10100, [row("ethereum", "native", WETH, "WETH9 contract")]);
  const g = await deployGate(scn, id);
  const a = await attestUntil(scn, "attester", id);
  const att = await read(B, "get_attestation", [id, 1]);
  log(scn, `ratio ${att.ratio_bps} bps, covered=${att.covered}`);
  if (att.ratio_bps !== 10000 || att.covered) throw new Error(`${scn}: 100.00% must be short of a 101% floor`);
  if (await read(B, "is_covered", [id, 0])) throw new Error(`${scn}: is_covered must be false`);
  await finalized(scn, a.hash, "the attestation");
  const reason = await gateRefuses(scn, g, "short");
  LOG.results.strict = { id, gate: g, ratio_bps: att.ratio_bps, refusal: reason };
}

async function challenge() {
  const scn = "challenge";
  const id = `e2e-${RUN}-challenge`;
  await register(scn, id, "WETH, challenged", "ethereum", WETH, 10000, [row("ethereum", "native", WETH, "WETH9 contract")]);
  const g = await deployGate(scn, id);
  const a1 = await attestUntil(scn, "attester", id);
  await finalized(scn, a1.hash, "attestation 1");
  await gateActs(scn, g, "before the challenge");
  const c = await tx(scn, "challenger", B, "challenge", [id, "missing_reserve", "https://etherscan.io/address/0x00000000219ab540356cBB839Cbe05303d7705Fa", "A real address with a large balance, as a probe", "ethereum", "native", BEACON]);
  if (!ok(c)) throw new Error(`${scn}: the challenge was not accepted`);
  await finalized(scn, c.hash, "the challenge");
  const disputed = await read(B, "get_attestation", [id, 1]);
  if (!disputed.disputed) throw new Error(`${scn}: the attestation should be disputed`);
  await gateRefuses(scn, g, "disputed");
  // a newer attestation clears it and shows the probe
  const m = await read(B, "get_monitor", [id]);
  const wait = Math.max(0, Number(m.last_ok_at) + 600 - Math.floor(Date.now() / 1000)) + 30;
  log(scn, `waiting ${wait}s for the cooldown`);
  await sleep(wait * 1000);
  const a2 = await attestUntil(scn, "attester", id);
  const att2 = await read(B, "get_attestation", [id, 2]);
  log(scn, `probe ${att2.probe?.holder} raw ${att2.probe?.raw}, disputed=${att2.disputed}`, { probe: att2.probe });
  if (!att2.probe || att2.probe.holder !== BEACON || att2.disputed || att2.ratio_bps !== 10000) throw new Error(`${scn}: attestation 2 is wrong`);
  const ch = await read(B, "get_challenge", [id, 1]);
  if (ch.open || Number(ch.cleared_by) !== 2) throw new Error(`${scn}: the challenge was not cleared by attestation 2`);
  await finalized(scn, a2.hash, "attestation 2");
  await gateActs(scn, g, "after the challenge cleared");
  LOG.results.challenge = { id, gate: g, probe: att2.probe, cleared_by: ch.cleared_by };
}

async function twochains() {
  const scn = "twochains";
  const id = `e2e-${RUN}-twochains`;
  const rows = [row("ethereum", "native", WETH, "WETH9 on Ethereum"), row("base", "native", BASE_WETH, "WETH on Base")];
  await register(scn, id, "Two chains", "ethereum", WETH, 10000, rows);
  const a = await attestUntil(scn, "attester", id);
  const att = await read(B, "get_attestation", [id, 1]);
  log(scn, `ratio ${att.ratio_bps} bps, ethereum ${att.blocks.ethereum.number}, base ${att.blocks.base.number}`);
  if (!att.blocks.ethereum || !att.blocks.base || att.ratio_bps < 10000) throw new Error(`${scn}: both chains must be read and the ratio must be at least 100%`);
  LOG.results.twochains = { id, ratio_bps: att.ratio_bps, blocks: att.blocks, lines: att.lines.map((x) => ({ label: x.label, raw: x.raw })) };
  await finalized(scn, a.hash, "the attestation");
}

async function erc20() {
  const scn = "erc20";
  const id = `e2e-${RUN}-erc20`;
  await register(scn, id, "wstETH backing", "ethereum", WSTETH, 10000, [row("ethereum", STETH, WSTETH, "stETH held by wstETH")]);
  const a = await attestUntil(scn, "attester", id);
  const att = await read(B, "get_attestation", [id, 1]);
  log(scn, `ratio ${att.ratio_bps} bps (stETH per wstETH is above 1), lines ${JSON.stringify(att.lines.map((x) => x.raw))}`);
  if (att.ratio_bps < 10000 || !att.covered) throw new Error(`${scn}: wstETH should be covered by the stETH it holds`);
  LOG.results.erc20 = { id, ratio_bps: att.ratio_bps, reserves: att.lines[0].raw, liabilities: att.liabilities };
  await finalized(scn, a.hash, "the attestation");
}

const all = { covered, strict, challenge, twochains, erc20 };
const only = process.env.ONLY ? process.env.ONLY.split(",") : Object.keys(all);
const settled = await Promise.allSettled(only.map((k) => all[k]()));
settled.forEach((s, i) => {
  if (s.status === "rejected") log(only[i], `FAILED: ${String(s.reason?.message || s.reason).slice(0, 600)}`);
});
LOG.finished = new Date().toISOString();
writeFileSync(`scripts/e2e-log-${RUN}.json`, JSON.stringify(LOG, null, 1));
console.log("\nRESULTS", JSON.stringify(plain(LOG.results), null, 1));
