"use client";

import { useState } from "react";
import { TxProgress } from "./TxProgress";
import { useAddReserve, useApplyRemoval, useCancelRemoval, useScheduleRemoval } from "@/lib/hooks/useBallast";
import { useWallet } from "@/lib/genlayer/wallet";
import { CHAINS, MAX_RESERVES, TIMELOCK, type Monitor } from "@/lib/contracts/types";
import { assetLabel, chainLabel } from "@/lib/explorers";
import { clock, short, withZeroX } from "@/lib/units";
import { MAX_LABEL, addressProblem, normAddress } from "@/lib/validate";

/** What only the registrant can do: add a reserve address (counts from the next attestation) or schedule one's removal (24 hours, in public). */
export function RegistrantPanel({ monitor, now }: { monitor: Monitor; now: number }) {
  const wallet = useWallet();
  const add = useAddReserve();
  const schedule = useScheduleRemoval();
  const cancel = useCancelRemoval();
  const apply = useApplyRemoval();
  const [chain, setChain] = useState("ethereum");
  const [kind, setKind] = useState<"native" | "token">("native");
  const [token, setToken] = useState("");
  const [holder, setHolder] = useState("");
  const [label, setLabel] = useState("");

  const isPending = (r: { chain: string; asset: string; holder: string }) => monitor.pending.find((p) => p.chain === r.chain && p.asset === r.asset && p.holder === r.holder);
  const canWrite = wallet.isConnected && wallet.isOnCorrectNetwork;
  const busy = add.isPending || schedule.isPending || cancel.isPending || apply.isPending;
  const problems = [
    holder ? addressProblem(holder, "The reserve address") : "",
    kind === "token" && token ? addressProblem(token, "The token address") : "",
    label.length > MAX_LABEL ? `A label can be at most ${MAX_LABEL} characters.` : "",
    monitor.reserves.length >= MAX_RESERVES ? `A monitor can list at most ${MAX_RESERVES} addresses.` : "",
  ].filter(Boolean);
  const asset = kind === "native" ? "native" : normAddress(token);
  const exists = monitor.reserves.some((r) => r.chain === chain && r.asset === asset && r.holder === normAddress(holder));
  const ready = canWrite && !busy && holder !== "" && (kind === "native" || token !== "") && problems.length === 0 && !exists;

  return (
    <section aria-labelledby="reg-h" className="b-card">
      <h2 id="reg-h">You registered this monitor</h2>
      <p className="b-help" style={{ margin: 0, maxWidth: "64ch" }}>A new address counts from the next attestation. Taking one away is scheduled in public and only takes effect {clock(TIMELOCK)} later, so a shortfall cannot be hidden by deleting its address.</p>

      <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column" }}>
        {monitor.reserves.map((r) => {
          const p = isPending(r);
          return (
            <li key={`${r.chain}${r.asset}${r.holder}`} style={{ borderTop: "1px solid var(--mist2)", padding: "10px 0", display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
              <span style={{ minWidth: 0 }}>
                <strong>{r.label || "Reserve"}</strong> <span className="b-mono b-muted" style={{ fontSize: 12 }}>{short(withZeroX(r.holder), 8, 6)}</span>
                <span className="b-muted" style={{ fontSize: 12 }}> {chainLabel(r.chain)}, {assetLabel(r.asset)}</span>
              </span>
              {p ? (
                <span style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8, fontSize: 13 }}>
                  <span className="b-chip disputed" style={{ fontSize: 11 }}>{p.at > now ? `Removal in ${clock(p.at - now)}` : "Removal ready"}</span>
                  {p.at <= now && <button type="button" className="b-btn small dark" disabled={!canWrite || busy} onClick={() => apply.run({ id: monitor.id, chain: r.chain, asset: r.asset, holder: r.holder })}>Apply</button>}
                  <button type="button" className="b-btn small ghost" disabled={!canWrite || busy} onClick={() => cancel.run({ id: monitor.id, chain: r.chain, asset: r.asset, holder: r.holder })}>Cancel</button>
                </span>
              ) : (
                <button type="button" className="b-btn small ghost" disabled={!canWrite || busy || monitor.reserves.length <= 1} onClick={() => schedule.run({ id: monitor.id, chain: r.chain, asset: r.asset, holder: r.holder })}>Schedule removal</button>
              )}
            </li>
          );
        })}
      </ul>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (ready) add.run({ id: monitor.id, chain, asset, holder: normAddress(holder), label: label.trim() });
        }}
        style={{ display: "flex", flexDirection: "column", gap: 10, borderTop: "1px solid var(--mist2)", paddingTop: 16 }}
      >
        <span className="b-label">Add a reserve address</span>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
          <select aria-label="Network" className="b-select" style={{ flex: "0 0 140px" }} value={chain} onChange={(e) => setChain(e.target.value)}>
            {CHAINS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
          <select aria-label="Asset" className="b-select" style={{ flex: "0 0 130px" }} value={kind} onChange={(e) => setKind(e.target.value as "native" | "token")}>
            <option value="native">ETH</option>
            <option value="token">A token</option>
          </select>
          <input aria-label="Reserve address" className="b-input mono" style={{ flex: "1 1 260px" }} placeholder="0x… holds the reserves" value={holder} onChange={(e) => setHolder(e.target.value)} />
          <input aria-label="Label" className="b-input" style={{ flex: "1 1 160px" }} placeholder="Label" value={label} onChange={(e) => setLabel(e.target.value)} />
        </div>
        {kind === "token" && <input aria-label="Token address" className="b-input mono" placeholder="0x… the token contract held at that address" value={token} onChange={(e) => setToken(e.target.value)} />}
        {exists && <span className="b-help" style={{ color: "var(--signal-ink)" }}>That address is already listed.</span>}
        {problems.map((p) => <span key={p} className="b-help" style={{ color: "var(--signal-ink)" }}>{p}</span>)}
        <button type="submit" className="b-btn small" style={{ alignSelf: "flex-start" }} disabled={!ready}>{add.isPending ? "Working…" : "Add address"}</button>
      </form>
      <TxProgress progress={add.progress ?? schedule.progress ?? cancel.progress ?? apply.progress} pending={busy} />
    </section>
  );
}
