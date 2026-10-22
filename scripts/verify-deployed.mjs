// Proves the contract source in this repo is exactly what runs on the network: it downloads the deployed code of each contract and compares it
// with the file in this repo (line endings ignored). Needs no wallet.
//   node scripts/verify-deployed.mjs                       Bradbury
//   NETWORK=studionet node scripts/verify-deployed.mjs     the hosted Studio network (chain id 61999)
import { readFileSync } from "fs";
import { createHash } from "crypto";
import { createClient } from "genlayer-js";
import { chain, NETWORK } from "./network.mjs";

const DEPLOYMENTS = {
  bradbury: [
    ["Ballast      (contracts/ballast.py)", "0xd1590EBBA44Cd2d00e003053811E47b9d2209668", "contracts/ballast.py"],
    ["GateExample  (contracts/gate_example.py)", "0x31e3dB2757aEF9A882bB0642674c03952BA492EB", "contracts/gate_example.py"],
  ],
  studionet: [
    ["Ballast      (contracts/ballast.py)", "0x4477105a01b7ddbCc449837Ec8Ed9900EbFD2a08", "contracts/ballast.py"],
    ["GateExample  (contracts/gate_example_studio.py)", "0x3d08946DCFd168335eFFf530862B1998aDD8C0E6", "contracts/gate_example_studio.py"],
  ],
};
const client = createClient({ chain });
const norm = (s) => s.replace(/\r\n/g, "\n");
const sha = (s) => createHash("sha256").update(s).digest("hex");
console.log(`network: ${NETWORK} (chain id ${chain.id})`);
let allSame = true;
for (const [label, address, file] of DEPLOYMENTS[NETWORK]) {
  const onchain = norm(await client.getContractCode(address));
  const local = norm(readFileSync(file, "utf8"));
  const same = onchain === local;
  allSame &&= same;
  console.log(`${same ? "IDENTICAL" : "DIFFERENT"}  ${label}  ${address}\n           on chain sha256 ${sha(onchain)}  (${onchain.length} chars)\n           in repo  sha256 ${sha(local)}  (${local.length} chars)`);
}
process.exit(allSame ? 0 : 1);
