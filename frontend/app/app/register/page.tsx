"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { AppBar } from "@/components/AppBar";
import { NetworkBanner } from "@/components/WalletModal";
import { TxProgress } from "@/components/TxProgress";
import { useRegister } from "@/lib/hooks/useBallast";
import { useWallet } from "@/lib/genlayer/wallet";
import { CHAINS, MAX_RESERVES, type ChainName } from "@/lib/contracts/types";
import { testRead, type TestResult } from "@/lib/testRead";
import { MAX_ID, MAX_LABEL, MAX_NAME, addressProblem, normAddress } from "@/lib/validate";
import { chainLabel } from "@/lib/explorers";
import { formatUnits, ratioText } from "@/lib/units";

interface Row {
  chain: ChainName;
  kind: "native" | "token";
  token: string;
  holder: string;
  label: string;
}
const blank = (): Row => ({ chain: "ethereum", kind: "native", token: "", holder: "", label: "" });
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, MAX_ID);

export default function RegisterPage() {
  const router = useRouter();
  const wallet = useWallet();
  const register = useRegister();
  const [name, setName] = useState("");
  const [id, setId] = useState("");
  const [idTouched, setIdTouched] = useState(false);
  const [rows, setRows] = useState<Row[]>([blank()]);
  const [liabChain, setLiabChain] = useState<ChainName>("ethereum");
  const [liabToken, setLiabToken] = useState("");
  const [minPct, setMinPct] = useState("100");
  const [hours, setHours] = useState("24");
  const [unitNum, setUnitNum] = useState("1");
  const [unitDen, setUnitDen] = useState("1");
  const [test, setTest] = useState<TestResult | null>(null);
  const [testErr, setTestErr] = useState("");
  const [testing, setTesting] = useState(false);

  const setRow = (i: number, patch: Partial<Row>) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const minBps = Math.round(Number(minPct) * 100);
  const maxAge = Math.round(Number(hours) * 3600);
  const num = Number(unitNum);
  const den = Number(unitDen);

  const problems: string[] = [];
  if (!name.trim() || name.length > MAX_NAME) problems.push(`Give the monitor a name of 1 to ${MAX_NAME} characters.`);
  if (!id || id.length > MAX_ID) problems.push(`The id must be 1 to ${MAX_ID} characters.`);
  if (liabToken === "" || addressProblem(liabToken)) problems.push("Enter the liability token's contract address.");
  if (!(minBps >= 5000 && minBps <= 30000)) problems.push("The minimum ratio must be between 50% and 300%.");
  if (!(maxAge >= 3600 && maxAge <= 30 * 86400)) problems.push("An attestation can be valid for 1 hour to 30 days.");
  if (!(Number.isInteger(num) && Number.isInteger(den) && num >= 1 && den >= 1 && num <= 1e6 && den <= 1e6)) problems.push("The unit multiplier must be whole numbers from 1 to 1000000.");
  if (rows.length < 1 || rows.length > MAX_RESERVES) problems.push(`List 1 to ${MAX_RESERVES} reserve addresses.`);
  rows.forEach((r, i) => {
    if (addressProblem(r.holder)) problems.push(`Reserve ${i + 1}: enter a valid address.`);
    if (r.kind === "token" && addressProblem(r.token)) problems.push(`Reserve ${i + 1}: enter the token contract address.`);
    if (r.label.length > MAX_LABEL) problems.push(`Reserve ${i + 1}: the label can be at most ${MAX_LABEL} characters.`);
  });
  const keys = rows.map((r) => `${r.chain}|${r.kind === "native" ? "native" : normAddress(r.token)}|${normAddress(r.holder)}`);
  if (new Set(keys).size !== keys.length) problems.push("A reserve address is listed twice.");

  const reservesPayload = rows.map((r) => ({ chain: r.chain, asset: r.kind === "native" ? "native" : normAddress(r.token), holder: normAddress(r.holder), label: r.label.trim() }));
  const canSend = wallet.isConnected && wallet.isOnCorrectNetwork && !register.isPending && problems.length === 0;

  const runTest = async () => {
    setTesting(true);
    setTestErr("");
    setTest(null);
    try {
      setTest(await testRead({ reserves: reservesPayload, liabChain, liabToken: normAddress(liabToken), unitNum: num, unitDen: den }));
    } catch (e: any) {
      setTestErr(String(e?.message ?? e));
    } finally {
      setTesting(false);
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSend) return;
    try {
      await register.runAsync({ id, name: name.trim(), liabChain, liabToken: normAddress(liabToken), unitNum: num, unitDen: den, minRatioBps: minBps, maxAge, reserves: reservesPayload });
      router.push(`/app/m/${encodeURIComponent(id)}`);
    } catch {
      // the hook already told the user why
    }
  };

  return (
    <div>
      <AppBar active="register" />
      <main className="b-wrap" style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "flex-start", gap: 32 }}>
        <form onSubmit={submit} style={{ flex: "999 1 560px", minWidth: 0, display: "flex", flexDirection: "column", gap: 28 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <h1 className="b-head" style={{ fontSize: 44, lineHeight: 1 }}>Register a monitor</h1>
            <p className="b-muted" style={{ margin: 0, maxWidth: "60ch" }}>Say what backs the claim and which token&apos;s supply is the liability. Anyone can register a monitor for any project: its attestations come from validators, not from you.</p>
          </div>
          <NetworkBanner />

          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <label className="b-label" htmlFor="m-name">Name</label>
            <input id="m-name" className="b-input" value={name} maxLength={MAX_NAME} onChange={(e) => { setName(e.target.value); if (!idTouched) setId(slug(e.target.value)); }} placeholder="Example Dollar (EXD)" />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <label className="b-label" htmlFor="m-id">Id</label>
            <input id="m-id" className="b-input mono" value={id} maxLength={MAX_ID} onChange={(e) => { setIdTouched(true); setId(e.target.value); }} placeholder="example-dollar" />
            <span className="b-help">The short name other contracts use to point at this monitor. It cannot be changed.</span>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <span className="b-label">Reserve addresses</span>
            {rows.map((r, i) => (
              <div key={i} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
                  <select aria-label={`Network ${i + 1}`} className="b-select" style={{ flex: "0 0 130px" }} value={r.chain} onChange={(e) => setRow(i, { chain: e.target.value as ChainName })}>
                    {CHAINS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                  </select>
                  <select aria-label={`Asset ${i + 1}`} className="b-select" style={{ flex: "0 0 120px" }} value={r.kind} onChange={(e) => setRow(i, { kind: e.target.value as "native" | "token" })}>
                    <option value="native">ETH</option>
                    <option value="token">A token</option>
                  </select>
                  <input aria-label={`Reserve address ${i + 1}`} className="b-input mono" style={{ flex: "1 1 280px" }} value={r.holder} onChange={(e) => setRow(i, { holder: e.target.value })} placeholder="0x… holds the reserves" />
                  <input aria-label={`Label ${i + 1}`} className="b-input" style={{ flex: "1 1 150px" }} value={r.label} onChange={(e) => setRow(i, { label: e.target.value })} placeholder="Label" maxLength={MAX_LABEL} />
                  {rows.length > 1 && <button type="button" className="b-btn ghost small" aria-label={`Remove row ${i + 1}`} onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))}>Remove</button>}
                </div>
                {r.kind === "token" && <input aria-label={`Token contract ${i + 1}`} className="b-input mono" value={r.token} onChange={(e) => setRow(i, { token: e.target.value })} placeholder="0x… the token contract held at that address" />}
              </div>
            ))}
            <button type="button" className="b-btn small" style={{ alignSelf: "flex-start", background: "transparent", color: "var(--cobalt)", border: "1px dashed var(--cobalt)" }} disabled={rows.length >= MAX_RESERVES} onClick={() => setRows((rs) => [...rs, blank()])}>Add another address</button>
            <p className="b-help" style={{ margin: 0, maxWidth: "64ch" }}>A new address counts from the next attestation. Taking one away is scheduled in public and only takes effect 24 hours later, so a shortfall cannot be hidden by deleting its address.</p>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <span className="b-label">Where the liabilities come from</span>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 12 }}>
              <div style={{ border: "2px solid var(--cobalt)", background: "var(--cobalt-soft)", borderRadius: 10, padding: "14px 16px" }}>
                <div style={{ fontWeight: 600 }}>On-chain supply</div>
                <div className="b-help">A token&apos;s totalSupply(), read by every validator. Other sources come later.</div>
              </div>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
              <select aria-label="Liability network" className="b-select" style={{ flex: "0 0 140px" }} value={liabChain} onChange={(e) => setLiabChain(e.target.value as ChainName)}>
                {CHAINS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
              <input aria-label="Liability token contract" className="b-input mono" style={{ flex: "1 1 280px" }} value={liabToken} onChange={(e) => setLiabToken(e.target.value)} placeholder="0x… the token whose supply is the liability" />
            </div>
          </div>

          <div style={{ display: "flex", flexWrap: "wrap", gap: 20 }}>
            <div style={{ flex: "1 1 200px", display: "flex", flexDirection: "column", gap: 8 }}>
              <label className="b-label" htmlFor="m-ratio">Minimum ratio (%)</label>
              <input id="m-ratio" className="b-input mono" inputMode="decimal" value={minPct} onChange={(e) => setMinPct(e.target.value)} />
            </div>
            <div style={{ flex: "1 1 200px", display: "flex", flexDirection: "column", gap: 8 }}>
              <label className="b-label" htmlFor="m-age">Attestation valid for (hours)</label>
              <input id="m-age" className="b-input" inputMode="decimal" value={hours} onChange={(e) => setHours(e.target.value)} />
            </div>
          </div>

          <details>
            <summary style={{ cursor: "pointer", fontWeight: 600 }}>Unit multiplier (advanced)</summary>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center", marginTop: 12 }}>
              <span className="b-help">Each reserve unit counts as</span>
              <input aria-label="Multiplier numerator" className="b-input mono" style={{ width: 110 }} value={unitNum} onChange={(e) => setUnitNum(e.target.value)} />
              <span>/</span>
              <input aria-label="Multiplier denominator" className="b-input mono" style={{ width: 110 }} value={unitDen} onChange={(e) => setUnitDen(e.target.value)} />
              <span className="b-help">of a liability unit. Leave it at 1 / 1 unless a token is worth a fixed fraction of another.</span>
            </div>
          </details>

          {problems.length > 0 && (name || liabToken || rows.some((r) => r.holder)) && (
            <ul className="b-alert" style={{ margin: 0, paddingLeft: 32, fontSize: 14 }}>{problems.slice(0, 5).map((p) => <li key={p}>{p}</li>)}</ul>
          )}
          {!wallet.isConnected && <div className="b-alert warn" style={{ fontSize: 14 }}>Connect your wallet to register.</div>}
          <button type="submit" className="b-btn" style={{ alignSelf: "flex-start", minHeight: 52, padding: "0 30px", fontSize: 16 }} disabled={!canSend}>{register.isPending ? "Working…" : "Register monitor"}</button>
          <TxProgress progress={register.progress} pending={register.isPending} />
        </form>

        <aside style={{ flex: "1 1 340px", minWidth: 0, display: "flex", flexDirection: "column", gap: 16 }}>
          <div className="b-card">
            <h2 style={{ fontSize: 20 }}>Test read, before you register</h2>
            <p className="b-help" style={{ margin: 0 }}>This reads your sources from this browser, the way the validators will, and sends nothing on-chain.</p>
            <button type="button" className="b-btn ghost" disabled={testing || problems.length > 0} onClick={runTest}>{testing ? "Reading…" : test ? "Run the test read again" : "Run the test read"}</button>
            {testErr && <div className="b-alert bad" role="alert" style={{ fontSize: 14 }}>{testErr}</div>}
            {test && (
              <>
                <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", fontSize: 14 }}>
                  {test.lines.map((l, i) => (
                    <li key={i} style={{ display: "flex", justifyContent: "space-between", gap: 10, padding: "9px 0", borderTop: "1px solid var(--mist2)" }}>
                      <span>{l.label || `Reserve ${i + 1}`} <span className="b-muted" style={{ fontSize: 12 }}>{chainLabel(l.chain)}</span></span>
                      <span className="b-mono" style={{ color: "var(--moss)" }}>{formatUnits(l.raw, l.decimals, 2)}</span>
                    </li>
                  ))}
                  <li style={{ display: "flex", justifyContent: "space-between", gap: 10, padding: "9px 0", borderTop: "1px solid var(--mist2)" }}>
                    <span>Token supply</span><span className="b-mono" style={{ color: "var(--moss)" }}>{formatUnits(test.supply, test.liabDecimals, 2)}</span>
                  </li>
                </ul>
                <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", borderTop: "2px solid var(--ink)", paddingTop: 12 }}>
                  <span style={{ fontWeight: 600 }}>Ratio if attested now</span>
                  <span className="b-head" style={{ fontSize: 28, color: test.ratioBps >= minBps ? "var(--moss)" : "var(--signal-ink)" }}>{ratioText(test.ratioBps)}</span>
                </div>
              </>
            )}
          </div>
          <p className="b-help" style={{ margin: 0 }}>Only reserves worth one unit of the liability each are supported, with no price feed: wrapped and bridged tokens, not volatile collateral.</p>
        </aside>
      </main>
    </div>
  );
}
