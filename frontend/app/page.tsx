import Link from "next/link";
import { Brand } from "@/components/Brand";

const REPO = "https://github.com/2TheMoom/ballast";

export default function Landing() {
  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <header className="b-bar" style={{ padding: "20px 40px" }}>
        <div style={{ flexGrow: 1 }}><Brand /></div>
        <Link href="/app" style={{ color: "var(--slate)", textDecoration: "none", fontWeight: 500 }}>Monitors</Link>
        <a href={REPO} style={{ color: "var(--slate)", textDecoration: "none", fontWeight: 500 }} target="_blank" rel="noreferrer">GitHub</a>
        <Link href="/app" className="b-btn dark small">Open the app</Link>
      </header>

      <main style={{ flexGrow: 1 }}>
        <section style={{ maxWidth: 1280, margin: "0 auto", padding: "80px 40px 64px", display: "flex", flexWrap: "wrap", alignItems: "center", gap: 56 }}>
          <div style={{ flex: "1 1 480px", minWidth: 0, display: "flex", flexDirection: "column", gap: 24 }}>
            <span style={{ alignSelf: "flex-start", display: "inline-flex", alignItems: "center", gap: 8, border: "1px solid var(--mist)", background: "var(--panel)", borderRadius: 999, padding: "6px 14px", fontSize: 13, color: "var(--slate)" }}>
              <span className="b-dot" />Live on GenLayer Bradbury Testnet
            </span>
            <h1 className="b-head" style={{ fontSize: "clamp(44px, 6vw, 76px)", lineHeight: 0.98, textWrap: "balance" } as React.CSSProperties}>
              Prove the reserves. Don&apos;t trust the blog post.
            </h1>
            <p style={{ margin: 0, fontSize: 19, color: "var(--ink2)", maxWidth: "52ch" }}>
              Ballast is an on-chain proof-of-reserves monitor. Independent validators read the reserve balances and the token supply at pinned blocks, agree exactly, and record an attestation that anyone can verify, challenge, or require before they send money.
            </p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
              <Link href="/app" className="b-btn" style={{ minHeight: 52, padding: "0 28px" }}>Browse monitors</Link>
              <Link href="/app/register" className="b-btn ghost" style={{ minHeight: 52, padding: "0 28px" }}>Register one</Link>
            </div>
          </div>

          <div className="b-card" style={{ flex: "1 1 480px", minWidth: 0, padding: 28 }}>
            <span style={{ fontSize: 12, fontWeight: 600, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--slate)" }}>What an attestation records</span>
            <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", fontSize: 14 }}>
              {[
                ["Pinned blocks", "One block per chain, 32 behind the head on Ethereum, with its hash"],
                ["Every balance", "Native or ERC-20, read on two or three independent providers that must agree exactly"],
                ["The supply", "The liability token's totalSupply() at the same pinned block"],
                ["The ratio", "Integer math in basis points, stored with the blocks it came from"],
              ].map(([k, v]) => (
                <li key={k} style={{ display: "flex", gap: 14, padding: "12px 0", borderTop: "1px solid var(--mist2)" }}>
                  <span style={{ width: 120, flexShrink: 0, fontWeight: 600 }}>{k}</span>
                  <span className="b-muted">{v}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section style={{ background: "var(--panel)", borderTop: "1px solid var(--mist)", borderBottom: "1px solid var(--mist)" }}>
          <div className="b-section" style={{ display: "flex", flexDirection: "column", gap: 40 }}>
            <h2 className="b-head" style={{ fontSize: 40, letterSpacing: "-0.02em" }}>How a claim of full backing gets checked</h2>
            <ol style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 32 }}>
              {[
                ["STEP 1", "Register a monitor", "List the reserve addresses and name the token whose on-chain supply is the liability. Set the ratio it must stay above and how fresh an attestation must be."],
                ["STEP 2", "Validators attest", "Each validator reads every balance through independent RPCs and the token supply on its own. The result only counts if they all see exactly the same thing."],
                ["STEP 3", "Anything can require it", "Another contract reads the latest attestation and refuses to act when it is short, stale or disputed. Anyone can challenge an attestation."],
              ].map(([n, t, d]) => (
                <li key={n} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  <span className="b-mono" style={{ fontSize: 13, color: "var(--cobalt)" }}>{n}</span>
                  <h3 style={{ margin: 0, fontSize: 21 }}>{t}</h3>
                  <p style={{ margin: 0, color: "var(--ink2)" }}>{d}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="b-section" style={{ display: "flex", flexWrap: "wrap", gap: 48 }}>
          <div style={{ flex: "1 1 400px", minWidth: 0, display: "flex", flexDirection: "column", gap: 14 }}>
            <h2 className="b-head" style={{ fontSize: 36, letterSpacing: "-0.02em", textWrap: "balance" } as React.CSSProperties}>What it proves, and what it can&apos;t</h2>
            <p style={{ margin: 0, color: "var(--ink2)", maxWidth: "52ch" }}>
              An attestation says what the named sources say at a named block. It cannot know about a reserve address nobody listed, and it only handles reserves worth one unit of the liability each, with no price feed. That is what the challenge is for, and why every attestation carries its sources.
            </p>
          </div>
          <div style={{ flex: "1 1 400px", minWidth: 0, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 16 }}>
            <div className="b-card" style={{ padding: 18, gap: 6 }}><span style={{ fontSize: 12, fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--moss)" }}>Proves</span><span style={{ color: "var(--ink2)" }}>The listed balances and the token supply, read the same way by independent providers and validators.</span></div>
            <div className="b-card" style={{ padding: 18, gap: 6 }}><span style={{ fontSize: 12, fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--signal-ink)" }}>Cannot prove</span><span style={{ color: "var(--ink2)" }}>That the list of addresses is complete. Anyone can challenge it with evidence.</span></div>
          </div>
        </section>

        <section style={{ borderTop: "1px solid var(--mist)" }}>
          <div className="b-section" style={{ padding: "56px 40px", display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 24 }}>
            <h2 className="b-head" style={{ fontSize: 32, maxWidth: "24ch", letterSpacing: "-0.02em" }}>See which monitors are covered right now.</h2>
            <Link href="/app" className="b-btn dark" style={{ minHeight: 52, padding: "0 28px" }}>Browse monitors</Link>
          </div>
        </section>
      </main>

      <footer style={{ borderTop: "1px solid var(--mist)", padding: "20px 40px", display: "flex", flexWrap: "wrap", justifyContent: "center", gap: "12px 28px", fontSize: 14 }}>
        <a href="https://genlayer.com" target="_blank" rel="noreferrer" style={{ color: "var(--slate)", textDecoration: "none" }}>Powered by GenLayer</a>
        <a href="https://docs.genlayer.com" target="_blank" rel="noreferrer" style={{ color: "var(--slate)", textDecoration: "none" }}>Docs</a>
        <a href={REPO} target="_blank" rel="noreferrer" style={{ color: "var(--slate)", textDecoration: "none" }}>GitHub</a>
      </footer>
    </div>
  );
}
