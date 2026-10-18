"use client";

import Link from "next/link";
import { use, useEffect, useState } from "react";
import { AppBar } from "@/components/AppBar";
import { Bars } from "@/components/Bars";
import { Beam } from "@/components/Beam";
import { ChallengeDialog } from "@/components/ChallengeDialog";
import { StatusChip } from "@/components/StatusChip";
import { TxProgress } from "@/components/TxProgress";
import { NetworkBanner } from "@/components/WalletModal";
import { finalityNote } from "@/lib/finality";
import { RegistrantPanel } from "@/components/RegistrantPanel";
import { readGateState, type GateState } from "@/lib/contracts/gate";
import { COOLDOWN, REASONS } from "@/lib/contracts/types";
import { addressUrl, assetLabel, blockUrl, chainLabel } from "@/lib/explorers";
import { getContractAddress, getGateAddress, getGateMonitorId } from "@/lib/genlayer/client";
import { useWallet } from "@/lib/genlayer/wallet";
import { useAttest, useAttestation, useChallenges, useHistory, useLatest, useMonitor, useResumeFinality } from "@/lib/hooks/useBallast";
import { usePendingWrites } from "@/lib/finality-store";
import { cooldownLeft, monitorState } from "@/lib/status";
import { ago, clock, formatUnits, ratioText, short, withZeroX } from "@/lib/units";

export default function MonitorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: raw } = use(params);
  const id = decodeURIComponent(raw);
  const wallet = useWallet();
  const { data: monitor, isLoading, error } = useMonitor(id);
  const { data: latest } = useLatest(id);
  const { data: att } = useAttestation(id, monitor?.count ?? 0);
  const { data: history } = useHistory(id);
  const { data: challenges } = useChallenges(id, monitor?.nChallenges ?? 0);
  const attest = useAttest();
  const pending = usePendingWrites(id);
  const [challengeOpen, setChallengeOpen] = useState(false);
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  useResumeFinality(id);
  useEffect(() => {
    const t = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(t);
  }, []);

  if (isLoading) return <Shell><div className="b-card">Reading this monitor from the chain…</div></Shell>;
  if (error) return <Shell><div className="b-alert bad" role="alert"><strong>Could not read this monitor</strong><span style={{ fontSize: 14 }}>{error.message}</span></div></Shell>;
  if (!monitor) return <Shell><div className="b-card"><strong>Monitor not found</strong><span className="b-muted">There is no monitor with the id &ldquo;{id}&rdquo;.</span><Link href="/app">Back to monitors</Link></div></Shell>;

  const state = monitorState(latest, now);
  const dec = att?.liabDecimals ?? 18;
  const left = cooldownLeft(monitor, COOLDOWN, now);
  const canWrite = wallet.isConnected && wallet.isOnCorrectNetwork;
  const isRegistrant = !!wallet.address && wallet.address.toLowerCase() === `0x${monitor.registrant.replace(/^0x/, "").toLowerCase()}`;
  const gateAddress = getGateAddress();
  const gateOn = !!gateAddress && getGateMonitorId() === monitor.id;
  const validFor = latest?.exists ? Math.max(0, latest.at + latest.maxAge - now) : 0;
  const shortfall = att && BigInt(att.liabilities) > BigInt(att.reservesTotal) ? (BigInt(att.liabilities) - BigInt(att.reservesTotal)).toString() : "0";

  return (
    <Shell>
      <Link href="/app" style={{ alignSelf: "flex-start", color: "var(--slate)", textDecoration: "none", fontSize: 14 }}>Back to monitors</Link>

      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-end", justifyContent: "space-between", gap: 20 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 10, minWidth: 0 }}>
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10 }}>
            <h1 className="b-head" style={{ fontSize: 44, lineHeight: 1, overflowWrap: "anywhere" }}>{monitor.name}</h1>
            <StatusChip state={state} />
          </div>
          <span className="b-muted" style={{ fontSize: 14 }}>
            {chainLabel(monitor.liabChain)} · must stay at or above {ratioText(monitor.minRatioBps)} · attestation valid for {clock(monitor.maxAge)} · registered by <span className="b-mono">{short(withZeroX(monitor.registrant), 6, 4)}</span>, not verified as the issuer
          </span>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
          <button type="button" className="b-btn" disabled={!canWrite || attest.isPending || left > 0} onClick={() => attest.run({ id })} title={left > 0 ? "An attestation was just recorded" : undefined}>
            {attest.isPending ? "Working…" : left > 0 ? `Attest again in ${clock(left)}` : monitor.count === 0 ? "Attest now" : "Attest again"}
          </button>
          <button type="button" className="b-btn ghost" disabled={!canWrite || monitor.count === 0} onClick={() => setChallengeOpen(true)}>Challenge latest</button>
        </div>
      </div>

      <NetworkBanner />
      {!wallet.isConnected && <div className="b-alert" style={{ fontSize: 14 }}>Connect your wallet to attest or challenge. Everything below can be read without one.</div>}
      <TxProgress progress={attest.progress} pending={attest.isPending} />
      {pending.length > 0 && (
        <div className="b-alert warn" role="status" style={{ fontSize: 14 }}>
          {pending.map((w) => (
            <span key={w.txHash}>{w.failed ? `${w.label}: not final. ${w.failed}` : `${w.label}: recorded, not final yet. ${finalityNote()}`}</span>
          ))}
        </div>
      )}

      {state === "short" && att && (
        <div className="b-alert bad" role="alert">
          <strong>Reserves are {formatUnits(shortfall, dec, 2)} below liabilities.</strong>
          <span style={{ fontSize: 14 }}>Contracts that require this monitor are refusing until it is covered again.</span>
        </div>
      )}
      {state === "disputed" && (
        <div className="b-alert warn" role="alert">
          <strong>The latest attestation is disputed.</strong>
          <span style={{ fontSize: 14 }}>A challenge is open, so a gate says no. Any newer attestation clears it: press Attest again once the cooldown allows.</span>
        </div>
      )}
      {state === "stale" && (
        <div className="b-alert" role="alert">
          <strong>The last attestation is older than this monitor allows.</strong>
          <span style={{ fontSize: 14 }} className="b-muted">Contracts that require it are refusing until someone attests again.</span>
        </div>
      )}
      {state === "none" && (
        <div className="b-alert" role="status">
          <strong>Nobody has attested this monitor yet.</strong>
          <span style={{ fontSize: 14 }} className="b-muted">Press Attest now. Validators read every balance and the supply at pinned blocks.</span>
        </div>
      )}

      {att ? (
        <section aria-label="Latest attestation" className="b-card" style={{ padding: 32, flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: "32px 48px" }}>
          <div style={{ flex: "1 1 520px", minWidth: 0 }}>
            <Beam
              reservesTotal={att.reservesTotal}
              liabilities={att.liabilities}
              decimals={dec}
              ratioBps={att.ratioBps}
              tone={state}
              reserveNote={`${att.lines.length} address${att.lines.length === 1 ? "" : "es"}`}
              liabilityNote="totalSupply(), on-chain"
            />
          </div>
          <dl style={{ flex: "1 1 280px", minWidth: 0, margin: 0, display: "grid", gridTemplateColumns: "auto 1fr", columnGap: 18, rowGap: 12, fontSize: 14 }}>
            <dt className="b-muted">{BigInt(shortfall) > BigInt(0) ? "Shortfall" : "Headroom"}</dt>
            <dd className="b-mono" style={{ margin: 0 }}>
              {BigInt(shortfall) > BigInt(0)
                ? `${formatUnits(shortfall, dec, 2)} below liabilities`
                : `+${formatUnits((BigInt(att.reservesTotal) - BigInt(att.liabilities)).toString(), dec, 2)} above liabilities`}
            </dd>
            <dt className="b-muted">Attested</dt><dd style={{ margin: 0 }}>{ago(att.at, now)}, attestation #{att.seq}</dd>
            <dt className="b-muted">Valid for</dt><dd style={{ margin: 0 }}>{validFor > 0 ? `${clock(validFor)} more` : "expired"}</dd>
            {Object.entries(att.blocks).map(([chain, b]) => (
              <FactBlock key={chain} chain={chain} number={b.number} hash={b.hash} />
            ))}
          </dl>
        </section>
      ) : null}

      <div style={{ display: "flex", flexWrap: "wrap", gap: 24, alignItems: "flex-start" }}>
        <div style={{ flex: "999 1 560px", minWidth: 0, display: "flex", flexDirection: "column", gap: 24 }}>
          <section aria-labelledby="res-h" className="b-card">
            <h2 id="res-h">Reserves, read independently</h2>
            <div className="b-scroll">
              <table className="b-table">
                <thead><tr><th scope="col">Address</th><th scope="col" style={{ textAlign: "right" }}>Balance</th><th scope="col" style={{ paddingLeft: 18 }}>Asset</th></tr></thead>
                <tbody>
                  {(att ? att.lines : monitor.reserves.map((r) => ({ ...r, raw: "", decimals: 18, value: "" }))).map((r) => (
                    <tr key={`${r.chain}${r.asset}${r.holder}`}>
                      <td>
                        <div style={{ fontWeight: 500 }}>{r.label || "Reserve"}</div>
                        <a className="b-mono" style={{ fontSize: 12 }} href={addressUrl(r.chain, r.holder)} target="_blank" rel="noreferrer">{short(withZeroX(r.holder), 8, 6)}</a>
                        <span className="b-muted" style={{ fontSize: 12 }}> on {chainLabel(r.chain)}</span>
                      </td>
                      <td className="b-mono" style={{ textAlign: "right" }}>{r.raw ? formatUnits(r.raw, r.decimals, 2) : "not read yet"}</td>
                      <td style={{ paddingLeft: 18 }} className="b-muted">{assetLabel(r.asset)}</td>
                    </tr>
                  ))}
                </tbody>
                {att && (
                  <tfoot><tr><td>Total reserves, in the liability token&apos;s units</td><td className="b-mono" style={{ textAlign: "right" }}>{formatUnits(att.reservesTotal, dec, 2)}</td><td /></tr></tfoot>
                )}
              </table>
            </div>
            {att?.probe && (
              <div className="b-alert warn" style={{ fontSize: 14 }}>
                <strong>A challenger&apos;s probe address, shown and not counted</strong>
                <span>
                  <a className="b-mono" href={addressUrl(att.probe.chain, att.probe.holder)} target="_blank" rel="noreferrer">{short(withZeroX(att.probe.holder), 8, 6)}</a> held {formatUnits(att.probe.raw, att.probe.decimals, 2)} {assetLabel(att.probe.asset)} on {chainLabel(att.probe.chain)}. If it belongs to the reserves, the registrant can add it.
                </span>
              </div>
            )}
            <p className="b-help" style={{ margin: 0, maxWidth: "66ch" }}>Ballast shows the balances it read, not where funds went. If you know of a reserve address that is missing from this list, challenge the attestation with that address as the probe.</p>
          </section>

          <section aria-labelledby="lia-h" className="b-card">
            <h2 id="lia-h">Liabilities, and where they come from</h2>
            <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 12, border: "1px solid var(--mist2)", borderRadius: 10, padding: "14px 16px" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
                <span style={{ fontWeight: 500 }}>Token supply</span>
                <a className="b-mono" style={{ fontSize: 12 }} href={addressUrl(monitor.liabChain, monitor.liabToken)} target="_blank" rel="noreferrer">totalSupply() on {short(withZeroX(monitor.liabToken), 8, 6)} ({chainLabel(monitor.liabChain)})</a>
              </div>
              <span className="b-chip" style={{ background: "var(--cobalt-soft)", color: "var(--cobalt)", fontSize: 12 }}>On-chain read</span>
              <span className="b-mono" style={{ fontWeight: 500 }}>{att ? formatUnits(att.liabilities, dec, 2) : "not read yet"}</span>
            </div>
            {(monitor.unitNum !== 1 || monitor.unitDen !== 1) && (
              <span className="b-help">Each reserve unit counts as {monitor.unitNum}/{monitor.unitDen} of a liability unit.</span>
            )}
          </section>

          {isRegistrant && <RegistrantPanel monitor={monitor} now={now} />}
        </div>

        <div style={{ flex: "1 1 340px", minWidth: 0, display: "flex", flexDirection: "column", gap: 24 }}>
          <section aria-labelledby="hist-h" className="b-card" style={{ padding: 22 }}>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10 }}>
              <h2 id="hist-h" style={{ fontSize: 20 }}>Last attestations</h2>
              <span className="b-help">ratio, 96 to 106%</span>
            </div>
            {history && history.length > 0 ? <Bars points={history} floorBps={monitor.minRatioBps} /> : <span className="b-muted">None yet.</span>}
          </section>

          <section aria-labelledby="use-h" className="b-card" style={{ padding: 22 }}>
            <h2 id="use-h" style={{ fontSize: 20 }}>Require this in a contract</h2>
            <p className="b-help" style={{ margin: 0 }}>Read it from finalized state and decide on your own clock. The record is small on purpose.</p>
            <div className="b-mono" style={{ background: "var(--ink)", color: "#dce4fa", borderRadius: 10, padding: "12px 14px", fontSize: 12, lineHeight: 1.6, overflowX: "auto", whiteSpace: "pre" }}>
{`gl.get_contract_at(BALLAST)
  .view(state=StorageType.LATEST_FINAL)
  .get_latest("${monitor.id}")
# {exists, covered, disputed, at, max_age, ...}`}
            </div>
            <span className="b-help">Ballast: <a href={`https://explorer-bradbury.genlayer.com/address/${getContractAddress()}`} target="_blank" rel="noreferrer" className="b-mono">{short(getContractAddress(), 8, 6)}</a></span>
            {gateOn && <GatePanel address={gateAddress} />}
          </section>

          <section aria-labelledby="ch-h" className="b-card" style={{ padding: 22 }}>
            <h2 id="ch-h" style={{ fontSize: 20 }}>Challenges</h2>
            <span className="b-muted" style={{ fontSize: 14 }}>
              {monitor.openChallenges > 0 ? `${monitor.openChallenges} open. Any newer attestation clears them.` : "None open."} An address can open one a day and a monitor holds three at a time.
            </span>
            {challenges && challenges.length > 0 && (
              <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column" }}>
                {challenges.map((c) => (
                  <li key={c.n} style={{ borderTop: "1px solid var(--mist2)", padding: "10px 0", display: "flex", flexDirection: "column", gap: 4, fontSize: 13 }}>
                    <span style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", gap: 8 }}>
                      <strong>{REASONS.find((r) => r.value === c.reason)?.label ?? c.reason}</strong>
                      <span className={`b-chip ${c.open ? "disputed" : "none"}`} style={{ fontSize: 11 }}>{c.open ? "Open" : `Cleared by #${c.clearedBy}`}</span>
                    </span>
                    <span className="b-muted">by <span className="b-mono">{short(c.challenger, 6, 4)}</span>, {ago(c.at, now)}, on attestation #{c.seq}</span>
                    {c.statement && <span>{c.statement}</span>}
                    {c.evidence && <a href={c.evidence} target="_blank" rel="noreferrer noopener" style={{ overflowWrap: "anywhere" }}>Evidence</a>}
                    {c.probe && <span className="b-muted">Probe: <span className="b-mono">{short(withZeroX(c.probe.holder), 8, 6)}</span> on {chainLabel(c.probe.chain)}</span>}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>

      {latest?.exists && <ChallengeDialog monitor={monitor} ratioBps={latest.ratioBps} open={challengeOpen} onOpenChange={setChallengeOpen} />}
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div>
      <AppBar active="monitors" />
      <main className="b-wrap" style={{ gap: 24 }}>{children}</main>
    </div>
  );
}

function FactBlock({ chain, number, hash }: { chain: string; number: number; hash: string }) {
  return (
    <>
      <dt className="b-muted">{chainLabel(chain)} block</dt>
      <dd style={{ margin: 0 }}>
        <a className="b-mono" href={blockUrl(chain as "ethereum" | "base", number)} target="_blank" rel="noreferrer">{number.toLocaleString("en-US")}</a>
        <div className="b-mono b-muted" style={{ fontSize: 11, overflowWrap: "anywhere" }} title={hash}>{short(hash, 10, 8)}</div>
      </dd>
    </>
  );
}

/** A live example of another contract requiring a Ballast attestation: its own count of what it did. */
function GatePanel({ address }: { address: string }) {
  const [state, setState] = useState<GateState | null>(null);
  const [err, setErr] = useState("");
  useEffect(() => {
    let stop = false;
    const load = () => readGateState(address).then((s) => !stop && setState(s)).catch((e) => !stop && setErr(String(e?.message ?? e)));
    load();
    const t = setInterval(load, 30000);
    return () => { stop = true; clearInterval(t); };
  }, [address]);
  return (
    <div style={{ borderTop: "1px solid var(--mist2)", paddingTop: 14, display: "flex", flexDirection: "column", gap: 6, fontSize: 14 }}>
      <strong>Live example: GateExample</strong>
      <span className="b-help">A contract that only acts while this monitor is covered, fresh and undisputed. <a className="b-mono" href={`https://explorer-bradbury.genlayer.com/address/${address}`} target="_blank" rel="noreferrer">{short(address, 8, 6)}</a></span>
      {state ? (
        <span>It has acted <strong>{state.performed}</strong> time{state.performed === 1 ? "" : "s"}{state.lastNote ? `. Last note: “${state.lastNote}”` : "."}</span>
      ) : err ? <span className="b-muted">Could not read it: {err}</span> : <span className="b-muted">Reading…</span>}
    </div>
  );
}
