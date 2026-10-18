/** Mirrors the contract's own input rules, so a refused call is caught before anything is sent. */
export const MAX_ID = 64;
export const MAX_NAME = 60;
export const MAX_LABEL = 40;

export function normAddress(x: string): string {
  return x.trim().toLowerCase().replace(/^0x/, "");
}

export function addressProblem(x: string, what = "The address"): string {
  return /^[0-9a-f]{40}$/.test(normAddress(x)) ? "" : `${what} must be 20 bytes of hex (0x followed by 40 characters).`;
}
