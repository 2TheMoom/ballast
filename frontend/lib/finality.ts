/** Other contracts read FINALIZED state, so a recorded change only counts for them once its transaction finalizes. */
export function finalityNote(): string {
  return "Contracts that read finalized state will see it in about 30 minutes.";
}
