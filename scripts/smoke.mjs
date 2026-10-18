// First live read: WETH9 on Ethereum mainnet. Its totalSupply() is its own ETH balance, so the ratio must come out at exactly 100.00%.
//   BALLAST=0x.. node scripts/smoke.mjs
import { clientFor, read, reasonOf, send, ts } from "./lib.mjs";

const B = process.env.BALLAST;
const WETH = "c02aaa39b223fe8d0a0e5c4f27ead9083c756cc2";
const client = clientFor("gl-test-1");
const id = process.env.ID || "weth-eth";

const rows = [{ chain: "ethereum", asset: "native", holder: WETH, label: "WETH9 contract" }];
try {
  const r = await send(client, B, "register", [id, "WETH on Ethereum", "ethereum", WETH, 1, 1, 10000, 86400, JSON.stringify(rows)]);
  console.log(`[${ts()}] register ${r.hash.slice(0, 12)} ${r.status} ${r.exec}`);
} catch (e) { console.log("register:", reasonOf(e)); }

for (let attempt = 1; attempt <= 6; attempt++) {
  const r = await send(client, B, "attest", [id]);
  console.log(`[${ts()}] attest #${attempt} ${r.hash.slice(0, 12)} ${r.status} exec=${r.exec} result=${r.result}`);
  if ((r.status === "ACCEPTED" || r.status === "FINALIZED") && r.exec === "FINISHED_WITH_RETURN") break;
}
const m = await read(B, "get_monitor", [id]);
console.log("count", m.count);
if (m.count > 0) console.log(JSON.stringify(await read(B, "get_attestation", [id, m.count]), null, 1));
