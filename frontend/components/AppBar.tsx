"use client";

import Link from "next/link";
import { Brand } from "./Brand";
import { WalletControl } from "./WalletModal";

/** The header every app screen shares: brand, the two app destinations, and the wallet. */
export function AppBar({ active }: { active?: "monitors" | "register" }) {
  return (
    <header className="b-bar">
      <Brand />
      <nav className="b-nav" aria-label="App">
        <Link href="/app" className={active === "monitors" ? "on" : undefined} aria-current={active === "monitors" ? "page" : undefined}>Monitors</Link>
        <Link href="/app/register" className={active === "register" ? "on" : undefined} aria-current={active === "register" ? "page" : undefined}>Register</Link>
      </nav>
      <WalletControl />
    </header>
  );
}
