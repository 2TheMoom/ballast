"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { useState } from "react";
import { TxProgress } from "./TxProgress";
import { useChallenge } from "@/lib/hooks/useBallast";
import { useWallet } from "@/lib/genlayer/wallet";
import { CHAINS, REASONS, type Monitor } from "@/lib/contracts/types";
import { ratioText } from "@/lib/units";
import { addressProblem } from "@/lib/validate";

/** Challenge the latest attestation. No bond. A probe address, if given, is read by the next attestation and shown, never counted. */
export function ChallengeDialog({ monitor, ratioBps, open, onOpenChange }: { monitor: Monitor; ratioBps: number; open: boolean; onOpenChange: (o: boolean) => void }) {
  const wallet = useWallet();
  const challenge = useChallenge();
  const [reason, setReason] = useState<string>(REASONS[0].value);
  const [evidence, setEvidence] = useState("");
  const [statement, setStatement] = useState("");
  const [probeChain, setProbeChain] = useState("ethereum");
  const [probeKind, setProbeKind] = useState<"native" | "token">("native");
  const [probeToken, setProbeToken] = useState("");
  const [probe, setProbe] = useState("");

  const probeOn = probe.trim() !== "";
  const problems = [
    evidence.length > 300 ? "Evidence can be at most 300 characters." : "",
    statement.length > 500 ? "The statement can be at most 500 characters." : "",
    probeOn ? addressProblem(probe, "The probe address") : "",
    probeOn && probeKind === "token" ? addressProblem(probeToken, "The token address") : "",
  ].filter(Boolean);
  const canSend = wallet.isConnected && wallet.isOnCorrectNetwork && !challenge.isPending && problems.length === 0;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSend) return;
    challenge.run({
      id: monitor.id,
      reason,
      evidence: evidence.trim(),
      statement: statement.trim(),
      probeChain: probeOn ? probeChain : "",
      probeAsset: probeOn ? (probeKind === "native" ? "native" : probeToken.trim()) : "",
      probeHolder: probeOn ? probe.trim() : "",
    });
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="b-scrim" />
        <Dialog.Content className="b-modal wide" aria-describedby={undefined}>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16 }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <Dialog.Title style={{ margin: 0, fontFamily: "var(--font-head)", fontWeight: 800, fontSize: 30, lineHeight: 1.05, letterSpacing: "-0.02em" }}>Challenge this attestation</Dialog.Title>
              <p className="b-muted" style={{ margin: 0, fontSize: 14 }}>A challenge disputes the current attestation, so contracts that require it say no until a newer one is recorded. Anyone can record the newer one, and it clears every open challenge.</p>
            </div>
            <Dialog.Close className="b-x" aria-label="Close">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><path d="M3 3l10 10M13 3L3 13" /></svg>
            </Dialog.Close>
          </div>

          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 10, background: "var(--paper)", borderRadius: 10, padding: "14px 16px" }}>
            <div style={{ display: "flex", flexDirection: "column" }}>
              <span style={{ fontWeight: 600 }}>{monitor.name}</span>
              <span className="b-help">Latest attestation of {monitor.count}</span>
            </div>
            <span className="b-head" style={{ fontSize: 26, color: ratioBps < monitor.minRatioBps ? "var(--signal-ink)" : "var(--moss)" }}>{ratioText(ratioBps)}</span>
          </div>

          <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 18 }}>
            <fieldset style={{ margin: 0, padding: 0, border: 0, display: "flex", flexDirection: "column", gap: 8 }}>
              <legend className="b-label" style={{ padding: 0, marginBottom: 8 }}>What is wrong with it?</legend>
              {REASONS.map((r) => (
                <label key={r.value} style={{ display: "flex", alignItems: "flex-start", gap: 12, border: `${reason === r.value ? 2 : 1}px solid ${reason === r.value ? "var(--cobalt)" : "var(--edge)"}`, background: reason === r.value ? "var(--cobalt-soft)" : "transparent", borderRadius: 10, padding: "12px 14px", cursor: "pointer" }}>
                  <input type="radio" name="why" checked={reason === r.value} onChange={() => setReason(r.value)} style={{ marginTop: 4, width: 18, height: 18 }} />
                  <span>
                    <span style={{ display: "block", fontWeight: 600 }}>{r.label}</span>
                    <span className="b-help" style={{ display: "block" }}>{r.hint}</span>
                  </span>
                </label>
              ))}
            </fieldset>

            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <label className="b-label" htmlFor="c-probe">A probe address (optional)</label>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
                <select aria-label="Probe network" className="b-select" style={{ flex: "0 0 140px" }} value={probeChain} onChange={(e) => setProbeChain(e.target.value)}>
                  {CHAINS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                </select>
                <select aria-label="Probe asset" className="b-select" style={{ flex: "0 0 130px" }} value={probeKind} onChange={(e) => setProbeKind(e.target.value as "native" | "token")}>
                  <option value="native">ETH</option>
                  <option value="token">A token</option>
                </select>
                <input id="c-probe" className="b-input mono" style={{ flex: "1 1 260px" }} placeholder="0x… the address you think is missing" value={probe} onChange={(e) => setProbe(e.target.value)} />
              </div>
              {probeOn && probeKind === "token" && <input aria-label="Token address" className="b-input mono" placeholder="0x… the token contract" value={probeToken} onChange={(e) => setProbeToken(e.target.value)} />}
              <span className="b-help">The next attestation reads it and shows its balance next to the result. It is never counted unless the registrant adds it.</span>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <label className="b-label" htmlFor="c-ev">Public evidence</label>
              <input id="c-ev" className="b-input" placeholder="A statement, post or explorer link" value={evidence} onChange={(e) => setEvidence(e.target.value)} />
              <span className="b-help">A link that ties your claim to these reserves. {evidence.length}/300</span>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <label className="b-label" htmlFor="c-st">What you found</label>
              <textarea id="c-st" className="b-textarea" rows={3} value={statement} onChange={(e) => setStatement(e.target.value)} />
              <span className="b-help">{statement.length}/500</span>
            </div>

            <p className="b-help" style={{ margin: 0, background: "var(--paper)", borderRadius: 8, padding: "10px 14px" }}>
              No bond. A challenge costs only the network fee. An address can open one challenge a day and a monitor holds three at a time.
            </p>

            {problems.map((p) => <div key={p} className="b-alert bad" role="alert" style={{ padding: "8px 14px", fontSize: 14 }}>{p}</div>)}
            {!wallet.isConnected && <div className="b-alert warn" style={{ padding: "8px 14px", fontSize: 14 }}>Connect your wallet to challenge.</div>}
            {wallet.isConnected && !wallet.isOnCorrectNetwork && <div className="b-alert warn" style={{ padding: "8px 14px", fontSize: 14 }}>Switch to the GenLayer network to challenge.</div>}

            <button type="submit" className="b-btn dark" style={{ minHeight: 52, fontSize: 16 }} disabled={!canSend}>
              {challenge.isPending ? "Working…" : "Challenge this attestation"}
            </button>
            <TxProgress progress={challenge.progress} pending={challenge.isPending} />
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
