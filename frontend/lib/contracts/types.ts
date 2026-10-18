export type ChainName = "ethereum" | "base";
export const CHAINS: { value: ChainName; label: string; id: number }[] = [
  { value: "ethereum", label: "Ethereum", id: 1 },
  { value: "base", label: "Base", id: 8453 },
];

/** Mirrors the constants in contracts/ballast.py; a test fails if they drift apart. */
export const MAX_RESERVES = 8;
export const COOLDOWN = 600;
export const TIMELOCK = 86400;
export const DAY = 86400;
export const MAX_OPEN_CHALLENGES = 3;
export const HISTORY = 20;
export const REASONS = [
  { value: "missing_reserve", label: "A reserve address is missing", hint: "Funds that back the claim sit at an address the monitor does not list." },
  { value: "liabilities", label: "The liabilities are understated", hint: "The issuer owes something the token's supply does not count." },
  { value: "wrong_read", label: "A balance read looks wrong", hint: "A listed address shows a different balance when you check it yourself." },
  { value: "stale", label: "The attestation is out of date", hint: "Things have clearly changed since the last attestation." },
] as const;

export interface Reserve {
  chain: ChainName;
  /** "native" or a lowercase token address without 0x */
  asset: string;
  holder: string;
  label: string;
}

export interface PendingRemoval {
  chain: ChainName;
  asset: string;
  holder: string;
  /** unix seconds when it can be applied */
  at: number;
}

export interface Monitor {
  id: string;
  name: string;
  registrant: string;
  liabChain: ChainName;
  liabToken: string;
  unitNum: number;
  unitDen: number;
  minRatioBps: number;
  maxAge: number;
  reserves: Reserve[];
  pending: PendingRemoval[];
  version: number;
  createdAt: number;
  lastOkAt: number;
  count: number;
  openChallenges: number;
  nChallenges: number;
}

export interface AttestationLine extends Reserve {
  raw: string;
  decimals: number;
  /** in the liability token's units */
  value: string;
}

export interface Attestation {
  seq: number;
  at: number;
  ratioBps: number;
  covered: boolean;
  reservesTotal: string;
  liabilities: string;
  /** the liability token's decimals; 18 when the contract did not record it */
  liabDecimals: number;
  lines: AttestationLine[];
  blocks: Record<string, { number: number; hash: string }>;
  probe: AttestationLine | null;
  disputed: boolean;
  version: number;
}

export interface HistoryPoint {
  seq: number;
  at: number;
  ratioBps: number;
  covered: boolean;
  disputed: boolean;
}

export interface Latest {
  exists: boolean;
  covered: boolean;
  disputed: boolean;
  at: number;
  ratioBps: number;
  seq: number;
  maxAge: number;
}

export interface Challenge {
  n: number;
  challenger: string;
  at: number;
  seq: number;
  reason: string;
  evidence: string;
  statement: string;
  probe: AttestationLine | null;
  open: boolean;
  clearedBy: number;
}

/** Where a write is in its life. Only "finalized" means it is really done. */
export type WriteStage = "signing" | "submitted" | "accepted" | "confirmed" | "finalized" | "failed";

export interface WriteProgress {
  txHash?: string;
  stage: WriteStage;
  message?: string;
}
