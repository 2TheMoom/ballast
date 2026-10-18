import type { Attestation, AttestationLine, Challenge, ChainName, HistoryPoint, Latest, Monitor, PendingRemoval, Reserve } from "./types.ts";

/** genlayer-js decodes Python dicts and dataclasses as Map instances or plain objects; flatten one level, recursively for lists. */
export function plain(raw: any): any {
  if (raw instanceof Map) return Object.fromEntries(Array.from(raw.entries()).map(([k, v]) => [k, plain(v)]));
  if (Array.isArray(raw)) return raw.map(plain);
  if (typeof raw === "bigint") return Number.isSafeInteger(Number(raw)) ? Number(raw) : raw.toString();
  return raw;
}

const n = (v: unknown) => Number(v ?? 0);
const s = (v: unknown, fallback = "") => String(v ?? fallback);

function reserve(r: any): Reserve {
  return { chain: s(r.chain) as ChainName, asset: s(r.asset), holder: s(r.holder), label: s(r.label) };
}

function line(r: any): AttestationLine {
  return { ...reserve(r), raw: s(r.raw, "0"), decimals: n(r.decimals), value: s(r.value, "0") };
}

export function decodeMonitor(raw: any): Monitor {
  const o = plain(raw);
  return {
    id: s(o.id),
    name: s(o.name),
    registrant: s(o.registrant),
    liabChain: s(o.liab_chain) as ChainName,
    liabToken: s(o.liab_token),
    unitNum: n(o.unit_num),
    unitDen: n(o.unit_den),
    minRatioBps: n(o.min_ratio_bps),
    maxAge: n(o.max_age),
    reserves: (o.reserves ?? []).map(reserve),
    pending: (o.pending ?? []).map((p: any): PendingRemoval => ({ ...reserve(p), at: n(p.at) })),
    version: n(o.version),
    createdAt: n(o.created_at),
    lastOkAt: n(o.last_ok_at),
    count: n(o.count),
    openChallenges: n(o.open_challenges),
    nChallenges: n(o.n_challenges),
  };
}

export function decodeAttestation(raw: any): Attestation {
  const o = plain(raw);
  return {
    seq: n(o.seq),
    at: n(o.at),
    ratioBps: n(o.ratio_bps),
    covered: Boolean(o.covered),
    reservesTotal: s(o.reserves_total, "0"),
    liabilities: s(o.liabilities, "0"),
    liabDecimals: o.liab_decimals === undefined ? 18 : n(o.liab_decimals),
    lines: (o.lines ?? []).map(line),
    blocks: Object.fromEntries(Object.entries(o.blocks ?? {}).map(([k, v]: [string, any]) => [k, { number: n(v.number), hash: s(v.hash) }])),
    probe: o.probe ? line(o.probe) : null,
    disputed: Boolean(o.disputed),
    version: n(o.version),
  };
}

export function decodeHistory(raw: any): HistoryPoint[] {
  return (plain(raw) ?? []).map((o: any) => ({ seq: n(o.seq), at: n(o.at), ratioBps: n(o.ratio_bps), covered: Boolean(o.covered), disputed: Boolean(o.disputed) }));
}

export function decodeLatest(raw: any): Latest {
  const o = plain(raw);
  return { exists: Boolean(o.exists), covered: Boolean(o.covered), disputed: Boolean(o.disputed), at: n(o.at), ratioBps: n(o.ratio_bps), seq: n(o.seq), maxAge: n(o.max_age) };
}

export function decodeChallenge(raw: any, num: number): Challenge {
  const o = plain(raw);
  return {
    n: num,
    challenger: s(o.challenger),
    at: n(o.at),
    seq: n(o.seq),
    reason: s(o.reason),
    evidence: s(o.evidence),
    statement: s(o.statement),
    probe: o.probe ? line(o.probe) : null,
    open: Boolean(o.open),
    clearedBy: n(o.cleared_by),
  };
}
