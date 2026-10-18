import type { Latest, Monitor } from "./contracts/types.ts";

export type MonitorState = "covered" | "short" | "stale" | "disputed" | "none";

/**
 * How a monitor reads right now, from its latest attestation. Order matters: no attestation, then a dispute (the gate says no), then
 * age (an old attestation says nothing about today), then the verdict itself.
 */
export function monitorState(latest: Latest | undefined, now = Math.floor(Date.now() / 1000)): MonitorState {
  if (!latest || !latest.exists) return "none";
  if (latest.disputed) return "disputed";
  if (now - latest.at > latest.maxAge) return "stale";
  return latest.covered ? "covered" : "short";
}

export const STATE_LABEL: Record<MonitorState, string> = {
  covered: "Covered",
  short: "Short",
  stale: "Stale",
  disputed: "Disputed",
  none: "Not attested yet",
};

/** Higher means riskier, for sorting the registry riskiest first. */
export const STATE_RISK: Record<MonitorState, number> = { short: 4, disputed: 3, stale: 2, none: 1, covered: 0 };

export function cooldownLeft(m: Pick<Monitor, "lastOkAt" | "count">, cooldown: number, now = Math.floor(Date.now() / 1000)): number {
  return m.count > 0 ? Math.max(0, m.lastOkAt + cooldown - now) : 0;
}
