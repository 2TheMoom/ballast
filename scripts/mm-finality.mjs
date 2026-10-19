import { writeFileSync } from "fs";
import { reader, read, sleep, ts } from "./lib.mjs";
const BALLAST = "0xd1590EBBA44Cd2d00e003053811E47b9d2209668";
const ID = "mm-weth-base-1";
const steps = [
  ["register the monitor", "0xc0654babfc42e586e373d82abb12d794c1a1c551fe3c41093bfe200bdee7c08d"],
  ["first attestation", "0xa99f078ec38dd0d166208a4c524dd45fcb5cb7401a66469859bffb6de919a919"],
  ["add a reserve address", "0xb1fb6402f8946a289bfcea4354fb801ffb9af845f82e0da8d172c775275f5ab8"],
  ["schedule its removal", "0x413327abe7033a2ab0f07dc6d64244238a372331fb884d968f806b0bed6121cb"],
  ["cancel the removal", "0xa87bc6f755bdc7ff919d8df2938b7509c17c2b959b19265a4bd7f31ec38c03b2"],
  ["challenge the attestation", "0x9da0b01639f49a46577cb484339f990f4948c811e7be1e3a8b062b3b36dd155e"],
  ["second attestation", "0x4c1a931c679d634b10d15705efc478fb9a3ab4c3701bd7125ae56ff78b4d676a"],
];
const out = { monitor: ID, ballast: BALLAST, started: new Date().toISOString(), steps: [] };
const t0 = Date.now();
for (const [name, hash] of steps) {
  let r;
  for (let i = 0; i < 400; i++) {
    r = await reader.getTransaction({ hash }).catch(() => null);
    if (r?.statusName === "FINALIZED") break;
    await sleep(15000);
  }
  const row = { name, hash, status: r?.statusName, result: r?.resultName, exec: r?.txExecutionResultName };
  out.steps.push(row);
  console.log(ts(), name, row.status, row.result, row.exec);
}
out.finalizedAfterMin = ((Date.now() - t0) / 60000).toFixed(1);
try { out.latest = await read(BALLAST, "get_latest", [ID]); } catch (e) { out.latestError = String(e).slice(0, 200); }
try { out.monitor_state = await read(BALLAST, "get_monitor", [ID]); } catch (e) { out.monitorError = String(e).slice(0, 200); }
writeFileSync("scripts/ui-mm/result.json", JSON.stringify(out, null, 1));
console.log("done", JSON.stringify(out.latest));
