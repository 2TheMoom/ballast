"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { useState } from "react";
import { useWallet } from "@/lib/genlayer/wallet";
import { switchToGenLayerNetwork } from "@/lib/genlayer/client";
import { short } from "@/lib/units";
import { NETWORK } from "@/lib/genlayer/network";

type Phase = "choose" | "waiting" | "cancelled" | "failed";

/** The connect dialog: choose a wallet, then the steps MetaMask goes through, with the two plain failures spelled out. */
export function ConnectDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const wallet = useWallet();
  const [phase, setPhase] = useState<Phase>("choose");
  const [message, setMessage] = useState("");

  const connect = async () => {
    setPhase("waiting");
    setMessage("");
    try {
      await wallet.connectWallet();
      onOpenChange(false);
      setPhase("choose");
    } catch (err: any) {
      const text = String(err?.message ?? "");
      if (/reject|denied|cancel/i.test(text)) setPhase("cancelled");
      else {
        setMessage(text || "The connection did not complete.");
        setPhase("failed");
      }
    }
  };

  const close = (o: boolean) => {
    if (!o) setPhase("choose");
    onOpenChange(o);
  };

  return (
    <Dialog.Root open={open} onOpenChange={close}>
      <Dialog.Portal>
        <Dialog.Overlay className="b-scrim" />
        <Dialog.Content className="b-modal" aria-describedby={undefined}>
          {phase === "waiting" ? (
            <>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <Dialog.Title className="b-head" style={{ fontSize: 28, lineHeight: 1.05 }}>Confirm in MetaMask</Dialog.Title>
                <p className="b-muted" style={{ margin: 0, fontSize: 14 }}>A request is waiting in your wallet. It asks to share your address, and to switch to the GenLayer network.</p>
              </div>
              <ol style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column" }}>
                <Step state={wallet.address ? "done" : "now"} title="Share your address" detail={wallet.address ? short(wallet.address, 6, 4) : "Approve the connection in MetaMask."} />
                <Step state={wallet.address ? (wallet.isOnCorrectNetwork ? "done" : "now") : "todo"} title={`Switch to GenLayer ${NETWORK.isStudio ? "Studionet" : "Bradbury"}`} detail={`Chain ${NETWORK.id}. Approve the switch in MetaMask.`} />
                <Step state={wallet.isConnected && wallet.isOnCorrectNetwork ? "done" : "todo"} title="Ready" detail="" />
              </ol>
              <p className="b-help" style={{ margin: 0 }}>Nothing appeared? Open the MetaMask icon in your browser toolbar. If you declined, you can try again.</p>
              <button type="button" className="b-btn ghost" onClick={() => close(false)}>Cancel</button>
            </>
          ) : (
            <>
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <Dialog.Title className="b-head" style={{ fontSize: 28, lineHeight: 1.05 }}>Connect a wallet</Dialog.Title>
                  <p className="b-muted" style={{ margin: 0, fontSize: 14 }}>You can browse every monitor without one. You need a wallet to register a monitor, attest, or challenge.</p>
                </div>
                <Dialog.Close className="b-x" aria-label="Close">
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><path d="M3 3l10 10M13 3L3 13" /></svg>
                </Dialog.Close>
              </div>

              {phase === "cancelled" && (
                <div className="b-alert bad" role="alert">
                  <strong>Connection cancelled</strong>
                  <span style={{ fontSize: 14 }}>You closed the request in MetaMask, so nothing was connected. Nothing was sent.</span>
                </div>
              )}
              {phase === "failed" && (
                <div className="b-alert bad" role="alert">
                  <strong>The connection did not complete</strong>
                  <span style={{ fontSize: 14 }}>{message}</span>
                </div>
              )}
              {!wallet.isMetaMaskInstalled && !wallet.isLoading && (
                <div className="b-alert" role="alert">
                  <strong>MetaMask not detected</strong>
                  <span style={{ fontSize: 14 }} className="b-muted">Install the MetaMask extension, then reload this page. Browsing monitors works without it.</span>
                </div>
              )}

              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <button
                  type="button"
                  onClick={connect}
                  disabled={!wallet.isMetaMaskInstalled}
                  style={{ display: "flex", alignItems: "center", gap: 14, textAlign: "left", minHeight: 64, borderRadius: 12, border: "2px solid var(--cobalt)", background: "var(--cobalt-soft)", color: "var(--ink)", padding: "10px 16px", cursor: wallet.isMetaMaskInstalled ? "pointer" : "not-allowed", opacity: wallet.isMetaMaskInstalled ? 1 : 0.5 }}
                >
                  <WalletIcon />
                  <span style={{ flexGrow: 1 }}>
                    <span style={{ display: "block", fontWeight: 600 }}>MetaMask</span>
                    <span className="b-muted" style={{ display: "block", fontSize: 13 }}>Browser extension</span>
                  </span>
                  {wallet.isMetaMaskInstalled && <span className="b-chip" style={{ background: "var(--moss-soft)", color: "var(--moss-deep)", fontSize: 12 }}>Detected</span>}
                </button>
                <button type="button" disabled style={{ display: "flex", alignItems: "center", gap: 14, textAlign: "left", minHeight: 64, borderRadius: 12, border: "1px solid var(--mist)", background: "#f7f9fd", color: "var(--faint)", padding: "10px 16px", cursor: "not-allowed" }}>
                  <WalletIcon muted />
                  <span style={{ flexGrow: 1 }}>
                    <span style={{ display: "block", fontWeight: 600 }}>Other wallets</span>
                    <span style={{ display: "block", fontSize: 13 }}>Ballast signs with MetaMask for now</span>
                  </span>
                </button>
              </div>

              <p className="b-help" style={{ margin: 0 }}>
                If you have several wallet extensions, Ballast picks MetaMask and ignores the others.{" "}
                <a href="https://metamask.io/download/" target="_blank" rel="noreferrer" style={{ fontWeight: 600 }}>Install MetaMask</a>
              </p>
              <p style={{ margin: 0, fontSize: 12, color: "var(--faint)", borderTop: "1px solid var(--mist2)", paddingTop: 14 }}>
                Ballast never asks for your seed phrase, and connecting does not move funds.
              </p>
            </>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function Step({ state, title, detail }: { state: "done" | "now" | "todo"; title: string; detail: string }) {
  return (
    <li style={{ display: "flex", alignItems: "center", gap: 14, padding: "12px 0", borderTop: "1px solid var(--mist2)" }}>
      <span
        style={{
          width: 26, height: 26, borderRadius: "50%", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", boxSizing: "border-box",
          ...(state === "done" ? { background: "var(--moss)" } : state === "now" ? { border: "2px solid var(--cobalt)", boxShadow: "0 0 0 4px rgba(37,71,245,0.16)" } : { border: "2px dashed var(--edge)" }),
        }}
      >
        {state === "done" && (
          <svg width="13" height="13" viewBox="0 0 12 12" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M2.5 6.5l2.5 2.5 4.5-5.5" /></svg>
        )}
      </span>
      <span style={{ flexGrow: 1 }}>
        <span style={{ display: "block", fontWeight: 600, color: state === "todo" ? "var(--faint)" : "var(--ink)" }}>{title}</span>
        {detail && <span className="b-mono b-muted" style={{ display: "block", fontSize: 12 }}>{detail}</span>}
      </span>
    </li>
  );
}

function WalletIcon({ muted }: { muted?: boolean }) {
  return (
    <span style={{ width: 40, height: 40, borderRadius: 10, background: "#fff", border: "1px solid var(--mist)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
      <svg width="22" height="22" viewBox="0 0 22 22" fill="none" stroke={muted ? "var(--edge)" : "var(--cobalt)"} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M3 7h14a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" /><path d="M3 7l12-4v4M15 13h3" />
      </svg>
    </span>
  );
}

/** The header's wallet control: Connect, or the connected address with its menu. */
export function WalletControl() {
  const wallet = useWallet();
  const [dialog, setDialog] = useState(false);
  const [menu, setMenu] = useState(false);
  const [copied, setCopied] = useState(false);

  if (wallet.isConnected && wallet.address) {
    return (
      <div style={{ position: "relative" }}>
        <button type="button" className="b-pill" aria-expanded={menu} onClick={() => setMenu((m) => !m)} title={wallet.address}>
          <span className={`b-dot${wallet.isOnCorrectNetwork ? "" : " warn"}`} />
          {short(wallet.address, 6, 4)}
        </button>
        {menu && (
          <div role="menu" style={{ position: "absolute", right: 0, top: "calc(100% + 8px)", width: 320, maxWidth: "calc(100vw - 32px)", background: "#fff", border: "1px solid var(--mist)", borderRadius: 14, padding: 18, display: "flex", flexDirection: "column", gap: 12, boxShadow: "0 14px 34px rgba(10,23,51,0.14)", zIndex: 40 }}>
            <div>
              <div className="b-muted" style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: "0.08em" }}>Address</div>
              <div className="b-mono" style={{ fontSize: 12, wordBreak: "break-all" }}>{wallet.address}</div>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, borderTop: "1px solid var(--mist2)", paddingTop: 12 }}>
              <span className="b-muted">Network</span>
              <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span className={`b-dot${wallet.isOnCorrectNetwork ? "" : " warn"}`} />
                {wallet.isOnCorrectNetwork ? `GenLayer ${NETWORK.isStudio ? "Studionet" : "Bradbury"}, ${NETWORK.id}` : "Not GenLayer"}
              </span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", borderTop: "1px solid var(--mist2)", paddingTop: 6 }}>
              <MenuItem onClick={() => { setMenu(false); wallet.switchWalletAccount().catch(() => undefined); }}>Switch account</MenuItem>
              <MenuItem onClick={() => { navigator.clipboard?.writeText(wallet.address ?? "").then(() => setCopied(true)).catch(() => undefined); setTimeout(() => setCopied(false), 1500); }}>{copied ? "Copied" : "Copy address"}</MenuItem>
              <MenuItem danger onClick={() => { setMenu(false); wallet.disconnectWallet(); }}>Disconnect</MenuItem>
            </div>
          </div>
        )}
      </div>
    );
  }
  return (
    <>
      <button type="button" className="b-btn small" disabled={wallet.isLoading && !dialog} onClick={() => setDialog(true)}>
        {wallet.isLoading ? "Connecting" : "Connect wallet"}
      </button>
      <ConnectDialog open={dialog} onOpenChange={setDialog} />
    </>
  );
}

function MenuItem({ children, onClick, danger }: { children: React.ReactNode; onClick: () => void; danger?: boolean }) {
  return (
    <button type="button" role="menuitem" onClick={onClick} style={{ textAlign: "left", minHeight: 44, border: 0, background: "transparent", color: danger ? "var(--signal-ink)" : "var(--ink)", fontSize: 14, fontWeight: danger ? 600 : 500, cursor: "pointer" }}>
      {children}
    </button>
  );
}

/** Shown on app pages when the wallet is connected but on another chain: reading still works, writing does not. */
export function NetworkBanner() {
  const wallet = useWallet();
  const [busy, setBusy] = useState(false);
  if (!wallet.isConnected || wallet.isOnCorrectNetwork || wallet.isLoading) return null;
  return (
    <div className="b-alert warn" role="alert" style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: "10px 16px" }}>
      <div style={{ flex: "1 1 240px", display: "flex", flexDirection: "column", gap: 2 }}>
        <strong>Your wallet is on another network.</strong>
        <span style={{ fontSize: 13 }}>Ballast runs on GenLayer {NETWORK.isStudio ? "Studionet" : "Bradbury"} (chain {NETWORK.id}). You can read, but register, attest and challenge need it.</span>
      </div>
      <button type="button" className="b-btn dark small" disabled={busy} onClick={() => { setBusy(true); switchToGenLayerNetwork().catch(() => undefined).finally(() => setBusy(false)); }}>
        Switch network
      </button>
    </div>
  );
}
