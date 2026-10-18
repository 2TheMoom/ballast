"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { AppBar } from "@/components/AppBar";
import { NetworkBanner } from "@/components/WalletModal";
import { StatusChip } from "@/components/StatusChip";
import { useMonitorList } from "@/lib/hooks/useBallast";
import { monitorState, STATE_RISK, type MonitorState } from "@/lib/status";
import { ago, ratioText, short } from "@/lib/units";

const FILTERS: { key: "all" | MonitorState; label: string }[] = [
  { key: "all", label: "All" },
  { key: "covered", label: "Covered" },
  { key: "short", label: "Short" },
  { key: "disputed", label: "Disputed" },
  { key: "stale", label: "Stale" },
  { key: "none", label: "Not attested" },
];

export default function Registry() {
  const { data, isLoading, error } = useMonitorList();
  const [filter, setFilter] = useState<"all" | MonitorState>("all");
  const [q, setQ] = useState("");
  const now = Math.floor(Date.now() / 1000);

  const rows = useMemo(() => {
    return (data ?? [])
      .map((r) => ({ ...r, state: monitorState(r.latest, now) }))
      .sort((a, b) => STATE_RISK[b.state] - STATE_RISK[a.state] || b.monitor.createdAt - a.monitor.createdAt);
  }, [data, now]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: rows.length };
    rows.forEach((r) => (c[r.state] = (c[r.state] ?? 0) + 1));
    return c;
  }, [rows]);

  const shown = rows.filter((r) => (filter === "all" || r.state === filter) && (!q || `${r.monitor.name} ${r.monitor.id}`.toLowerCase().includes(q.toLowerCase())));

  return (
    <div>
      <AppBar active="monitors" />
      <main className="b-wrap" style={{ gap: 24 }}>
        <NetworkBanner />
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-end", justifyContent: "space-between", gap: 20 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <h1 className="b-head" style={{ fontSize: 48, lineHeight: 1 }}>Monitors</h1>
            <p className="b-muted" style={{ margin: 0, maxWidth: "62ch" }}>
              Every monitor, with its latest attestation. Riskiest first. Anyone can register a monitor and registrants are not verified as the issuer, so check who registered the one you rely on.
            </p>
          </div>
          <Link href="/app/register" className="b-btn">Register a monitor</Link>
        </div>

        <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
          {([["Monitors", counts.all ?? 0, "var(--slate)", "var(--mist)"], ["Covered", counts.covered ?? 0, "var(--moss)", "var(--mist)"], ["Short", counts.short ?? 0, "var(--signal-ink)", "var(--signal)"], ["Disputed or stale", (counts.disputed ?? 0) + (counts.stale ?? 0), "var(--slate)", "var(--mist)"]] as const).map(([k, v, c, edge]) => (
            <div key={k} style={{ flex: "1 1 160px", background: "var(--panel)", border: `1px solid ${edge}`, borderRadius: 12, padding: "14px 18px" }}>
              <div style={{ fontSize: 12, color: c, textTransform: "uppercase", letterSpacing: "0.08em" }}>{k}</div>
              <div className="b-mono" style={{ fontSize: 26 }}>{v}</div>
            </div>
          ))}
        </div>

        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10 }}>
          {FILTERS.filter((f) => f.key === "all" || (counts[f.key] ?? 0) > 0).map((f) => (
            <button
              key={f.key}
              type="button"
              aria-pressed={filter === f.key}
              onClick={() => setFilter(f.key)}
              style={{ minHeight: 40, padding: "0 16px", borderRadius: 999, border: `1px solid ${filter === f.key ? "var(--ink)" : "var(--mist)"}`, background: filter === f.key ? "var(--ink)" : "var(--panel)", color: filter === f.key ? "#fff" : "var(--ink)", fontWeight: filter === f.key ? 600 : 500, cursor: "pointer" }}
            >
              {f.label} {counts[f.key] ?? 0}
            </button>
          ))}
          <div style={{ flexGrow: 1, minWidth: 200, display: "flex", justifyContent: "flex-end" }}>
            <label htmlFor="q" style={{ position: "absolute", width: 1, height: 1, overflow: "hidden" }}>Search monitors</label>
            <input id="q" className="b-input" type="search" placeholder="Search by name or id" value={q} onChange={(e) => setQ(e.target.value)} style={{ maxWidth: 300, minHeight: 40 }} />
          </div>
        </div>

        {isLoading && <div className="b-card">Reading the monitors from the chain…</div>}
        {error && <div className="b-alert bad" role="alert"><strong>Could not read the monitors</strong><span style={{ fontSize: 14 }}>{error.message}</span></div>}
        {!isLoading && !error && shown.length === 0 && (
          <div className="b-card" style={{ textAlign: "center", padding: 40 }}>
            <strong>{rows.length === 0 ? "No monitors yet" : "No monitors match"}</strong>
            <span className="b-muted">{rows.length === 0 ? "Register the first one." : "Try another filter."}</span>
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {shown.map(({ monitor: m, latest, state }) => (
            <Link
              key={m.id}
              href={`/app/m/${encodeURIComponent(m.id)}`}
              style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "14px 28px", background: "var(--panel)", border: `1px ${state === "stale" || state === "none" ? "dashed" : "solid"} ${state === "short" ? "var(--signal)" : state === "stale" || state === "none" ? "var(--edge)" : "var(--mist)"}`, borderRadius: 14, padding: "18px 22px", textDecoration: "none", color: "var(--ink)" }}
            >
              <div style={{ flex: "1 1 240px", minWidth: 0, display: "flex", flexDirection: "column", gap: 4 }}>
                <span style={{ fontWeight: 600, fontSize: 17, overflowWrap: "anywhere" }}>{m.name}</span>
                <span className="b-muted" style={{ fontSize: 13 }}>
                  {m.liabChain === "base" ? "Base" : "Ethereum"} · floor {ratioText(m.minRatioBps)} · by {short(m.registrant, 6, 4)}
                </span>
              </div>
              <div className="b-mono" style={{ width: 110, fontSize: 22, fontWeight: 500, color: state === "covered" ? "var(--moss)" : state === "short" ? "var(--signal-ink)" : "var(--faint)" }}>
                {latest.exists ? ratioText(latest.ratioBps) : "n/a"}
              </div>
              <StatusChip state={state} />
              <span className="b-muted" style={{ width: 110, fontSize: 13 }}>{latest.exists ? ago(latest.at, now) : "never"}</span>
            </Link>
          ))}
        </div>
      </main>
    </div>
  );
}
