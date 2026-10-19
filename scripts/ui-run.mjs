// Drives the real Ballast app in headless Chrome with a wallet shim that signs with a dedicated Bradbury test wallet
// (the harness lives outside this repo; it exposes http://localhost:3999 for signing and http://localhost:3998 to control the page).
// Every click goes through the real UI and every transaction is a real transaction on Bradbury.
//   APP=http://localhost:3333 node scripts/ui-run.mjs        writes scripts/ui-run-<tag>.json and PNGs next to it
import { mkdirSync, writeFileSync } from "fs";

const APP = process.env.APP || "http://localhost:3333";
const TAG = process.env.TAG || Date.now().toString(36);
const OUT = `scripts/ui-${TAG}`;
mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const post = async (path, body) => (await fetch(`http://localhost:3998${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body || {}) })).json();
const ev = async (expr) => {
  const r = await post("/eval", { expr });
  if (r.error) throw new Error(`eval: ${String(r.error).slice(0, 300)}`);
  return r.value;
};
const nav = (path, wait = 7000) => post("/nav", { url: `${APP}${path}`, wait });
const shot = (name) => post("/shot", { path: `${process.cwd().replace(/\\/g, "/")}/${OUT}/${name}.png` }); // the driver runs elsewhere, so the path must be absolute
const text = () => ev("document.body.innerText");
const log = (m) => console.log(`[${new Date().toISOString().slice(11, 19)}] ${m}`);
const RESULTS = { tag: TAG, steps: [] };
const step = (name, ok, detail) => {
  RESULTS.steps.push({ name, ok, detail });
  log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ": " + detail : ""}`);
  if (!ok) throw new Error(`step failed: ${name} ${detail || ""}`);
};

// ---- page helpers, installed on every page we visit
const HELPERS = `
window.__u = {
  set(sel, value) {
    const el = document.querySelector(sel);
    if (!el) return 'missing ' + sel;
    const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : el.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, value);
    el.dispatchEvent(new Event(el.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }));
    return 'ok';
  },
  click(text, exact) {
    const b = [...document.querySelectorAll('button, a')].find((x) => { const t = x.textContent.trim().toLowerCase(); return (exact ? t === text.toLowerCase() : t.includes(text.toLowerCase())) && !x.disabled && !x.hasAttribute('aria-disabled'); });
    if (!b) return 'no enabled control: ' + text;
    b.click();
    return 'clicked ' + text;
  },
  enabled(text) { return [...document.querySelectorAll('button')].some((x) => x.textContent.trim().toLowerCase().includes(text.toLowerCase()) && !x.disabled); },
  radio(labelText) { const l = [...document.querySelectorAll('label')].find((x) => x.textContent.toLowerCase().includes(labelText.toLowerCase())); if (!l) return 'no radio'; l.querySelector('input').click(); return 'ok'; },
};`;
const install = () => ev(HELPERS);
const pageHas = async (needle, timeout = 60000) => {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    if ((await text()).includes(needle)) return true;
    await sleep(2000);
  }
  return false;
};

// ---- the run
async function connect() {
  await install();
  const r = await ev(`window.__u.click('Connect wallet')`);
  await sleep(1500);
  const dialog = await text();
  step("the connect dialog opens", dialog.includes("Connect a wallet") && dialog.includes("MetaMask"), r);
  await shot("01-connect-dialog");
  await ev(`window.__u.click('MetaMask', false)`);
  let connected = false;
  for (let i = 0; i < 20 && !connected; i++) { connected = await ev(`!!document.querySelector('.b-pill')`); await sleep(1500); }
  step("connecting through the dialog shows the wallet address", connected);
}

async function register(id) {
  await nav("/app/register");
  await install();
  await connectIfNeeded();
  const U = (sel, v) => ev(`window.__u.set(${JSON.stringify(sel)}, ${JSON.stringify(v)})`);
  await U("#m-name", "UI run: WETH on Base");
  await U("#m-id", id);
  await U('[aria-label="Network 1"]', "base");
  await U('[aria-label="Reserve address 1"]', "0x4200000000000000000000000000000000000006");
  await U('[aria-label="Label 1"]', "WETH on Base");
  await U('[aria-label="Liability network"]', "base");
  await U('[aria-label="Liability token contract"]', "0x4200000000000000000000000000000000000006");
  await sleep(800);
  await shot("02-register-filled");
  step("the register button is enabled for a valid form", await ev(`window.__u.enabled('Register monitor')`));
  await ev(`window.__u.click('Run the test read')`);
  const tested = await pageHas("Ratio if attested now", 45000);
  const t = await text();
  step("the browser test read shows 100.00%", tested && t.includes("100.00%"), tested ? undefined : "the providers did not answer this browser");
  await shot("03-test-read");
  await ev(`window.__u.click('Register monitor', true)`);
  const landed = await pageHas("UI run: WETH on Base", 240000);
  const path = await ev("location.pathname");
  step("registering lands on the new monitor page", landed && path.includes(id), path);
  await shot("04-registered");
}

async function connectIfNeeded() {
  const isConnected = () => ev(`!!document.querySelector('.b-pill')`);
  if (!(await isConnected())) {
    await ev(`window.__u.click('Connect wallet')`);
    await sleep(1500);
    await ev(`window.__u.click('MetaMask', false)`);
    for (let i = 0; i < 20 && !(await isConnected()); i++) await sleep(1500);
  }
}

async function attest(id, label) {
  await nav(`/app/m/${id}`);
  await install();
  await connectIfNeeded();
  step(`${label}: the Attest button is enabled`, await pageHas("Attest", 20000) && (await ev(`window.__u.enabled('Attest')`)));
  await ev(`window.__u.click('Attest', false)`);
  const ok = await pageHas("Recorded, not final", 300000) || (await text()).includes("Finalized");
  step(`${label}: the attestation is recorded`, ok);
  const done = await pageHas("attestation #1", 120000);
  step(`${label}: the page shows attestation #1 at exactly 100.00%`, done && /100\.00%\s*Headroom/.test(await text()));
  await shot(`05-${label.replace(/\W+/g, "-")}`);
}

async function main() {
  const id = `ui-${TAG}`;
  await nav("/app");
  await connect();
  await register(id);
  await attest(id, "first attestation");

  // registrant panel: add a reserve address, schedule its removal, cancel the removal
  await nav(`/app/m/${id}`);
  await install();
  await connectIfNeeded();
  step("the registrant panel shows for the registrant", await pageHas("You registered this monitor", 30000));
  const U = (sel, v) => ev(`window.__u.set(${JSON.stringify(sel)}, ${JSON.stringify(v)})`);
  await U('[aria-label="Network"]', "base");
  await U('[aria-label="Reserve address"]', "0x4200000000000000000000000000000000000016");
  await U('[aria-label="Label"]', "OP message passer");
  await sleep(500);
  await ev(`window.__u.click('Add address')`);
  step("adding a reserve address is recorded", await pageHas("Reserve address added", 300000));
  await sleep(8000);
  await nav(`/app/m/${id}`);
  await install();
  await connectIfNeeded();
  const withRow = await pageHas("OP message passer", 30000);
  step("the new address is listed", withRow);
  await ev(`(() => { const li = [...document.querySelectorAll('li')].find((x) => x.textContent.includes('OP message passer')); const b = li && [...li.querySelectorAll('button')].find((x) => x.textContent.includes('Schedule removal')); if (b) b.click(); return !!b; })()`);
  step("scheduling a removal is recorded", await pageHas("Removal scheduled", 300000));
  await sleep(8000);
  await nav(`/app/m/${id}`);
  await install();
  await connectIfNeeded();
  step("the pending removal shows its countdown", await pageHas("Removal in 23 h", 30000) || (await text()).includes("Removal in 24 h"));
  await shot("06-removal-scheduled");
  await ev(`(() => { const li = [...document.querySelectorAll('li')].find((x) => x.textContent.includes('OP message passer')); const b = li && [...li.querySelectorAll('button')].find((x) => x.textContent.trim() === 'Cancel'); if (b) b.click(); return !!b; })()`);
  step("cancelling the removal is recorded", await pageHas("Removal cancelled", 300000));

  // challenge with a probe address
  await sleep(8000);
  await nav(`/app/m/${id}`);
  await install();
  await connectIfNeeded();
  await ev(`window.__u.click('Challenge latest')`);
  await sleep(1500);
  step("the challenge dialog opens", (await text()).includes("Challenge this attestation"));
  await ev(`window.__u.radio('A reserve address is missing')`);
  await U('[aria-label="Probe network"]', "base");
  await U("#c-probe", "0x4200000000000000000000000000000000000010");
  await U("#c-ev", "https://basescan.org/address/0x4200000000000000000000000000000000000010");
  await U("#c-st", "A probe address from the UI run: it should be shown next to the next attestation, not counted.");
  await sleep(600);
  await shot("07-challenge-dialog");
  await ev(`window.__u.click('Challenge this attestation', true)`);
  step("the challenge is recorded", await pageHas("Challenge recorded", 300000));
  await sleep(8000);
  await nav(`/app/m/${id}`);
  await install();
  await connectIfNeeded();
  step("the monitor now reads Disputed", await pageHas("The latest attestation is disputed", 30000));
  await shot("08-disputed");

  // wait out the cooldown, attest again: the dispute clears and the probe is shown
  const m = await text();
  log("waiting out the cooldown before the second attestation");
  for (let i = 0; i < 80; i++) {
    await nav(`/app/m/${id}`, 6000);
    await install();
    await connectIfNeeded();
    if (await ev(`window.__u.enabled('Attest again')`)) break;
    await sleep(15000);
  }
  await ev(`window.__u.click('Attest again')`);
  step("the second attestation is recorded", await pageHas("Recorded, not final", 300000));
  await sleep(10000);
  await nav(`/app/m/${id}`);
  await pageHas("attestation #2", 120000);
  const after = await text();
  step("the dispute is cleared and the probe is shown, not counted", !after.includes("The latest attestation is disputed") && after.includes("A challenger's probe address"));
  await shot("09-cleared-with-probe");
  void m;
  RESULTS.finished = new Date().toISOString();
  RESULTS.monitor = id;
  writeFileSync(`${OUT}/result.json`, JSON.stringify(RESULTS, null, 1));
  log("UI run finished: every step passed");
}

main().catch((e) => {
  RESULTS.error = String(e.message || e);
  writeFileSync(`${OUT}/result.json`, JSON.stringify(RESULTS, null, 1));
  console.error("UI run stopped:", RESULTS.error);
  process.exit(1);
});
