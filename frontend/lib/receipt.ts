/**
 * What a transaction receipt says about whether the contract actually ran. A wallet shows a transaction as "confirmed" once it is
 * on chain; that says nothing about the GenLayer execution. Returns a plain explanation when the write did NOT take effect, or null.
 */
const TIMED_OUT = ["LEADER_TIMEOUT", "VALIDATORS_TIMEOUT", "UNDETERMINED", "CANCELED"];

export function failedReceiptMessage(receipt: any, functionName: string, txHash: string): string | null {
  const status = String(receipt?.statusName ?? "");
  const exec = String(receipt?.txExecutionResultName ?? "");
  if (TIMED_OUT.includes(status) || exec === "NOT_VOTED" || exec === "IDLE") {
    return `Validators did not complete ${functionName} (${status || exec}). Nothing was recorded, even though your wallet may show the transaction as confirmed. This happens now and then on the testnet: try again. Transaction ${txHash}.`;
  }
  if (exec && exec !== "FINISHED_WITH_RETURN") {
    return `The contract refused ${functionName} (${exec}). Nothing changed. Transaction ${txHash}.`;
  }
  return null;
}

/** A read the contract itself refused (for example "Monitor not found") versus one that never got an answer (RPC down, timeout). */
export function isContractRefusal(error: unknown): boolean {
  return /execution failed/i.test(String((error as any)?.message ?? error ?? ""));
}

/**
 * The contract's own refusal text. The node returns it as raw bytes inside the error message, so pull out the readable sentence.
 * Null when the error carries no contract refusal (a network failure, say).
 */
export function refusalReason(err: unknown): string | null {
  const text = String((err as any)?.message ?? err);
  const m = text.match(/ReturnData:\[\]uint8\{([^}]*)\}/);
  if (!m) return null;
  const bytes = m[1].split(",").map((x) => parseInt(x.trim(), 16)).filter((v) => !Number.isNaN(v));
  const runs: string[] = [];
  let cur = "";
  for (const b of bytes) {
    if (b >= 32 && b < 127) cur += String.fromCharCode(b);
    else {
      if (cur.length >= 10) runs.push(cur);
      cur = "";
    }
  }
  if (cur.length >= 10) runs.push(cur);
  return runs.find((r) => r.includes(" ")) ?? null;
}
