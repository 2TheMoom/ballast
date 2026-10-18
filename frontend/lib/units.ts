/** "1042600000000000000000000" at 18 decimals -> "1,042,600" (whole units, grouped), with up to `places` decimals when small. */
export function formatUnits(raw: string | bigint, decimals: number, places = 2): string {
  let v: bigint;
  try {
    v = BigInt(raw);
  } catch {
    return "0";
  }
  const base = BigInt(10) ** BigInt(decimals);
  const whole = v / base;
  const frac = v % base;
  const grouped = whole.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  if (places <= 0 || frac === BigInt(0)) return grouped;
  const f = frac.toString().padStart(decimals, "0").slice(0, places).replace(/0+$/, "");
  return f ? `${grouped}.${f}` : grouped;
}

/** Compact: 1,042,600,000 -> "1.04B", 2,203,409 -> "2.20M", 640 -> "640". */
export function compactUnits(raw: string | bigint, decimals: number): string {
  let v: bigint;
  try {
    v = BigInt(raw);
  } catch {
    return "0";
  }
  const base = BigInt(10) ** BigInt(decimals);
  const whole = Number(v / base) + Number(v % base) / Number(base);
  const steps: [number, string][] = [[1e12, "T"], [1e9, "B"], [1e6, "M"], [1e3, "K"]];
  for (const [size, tag] of steps) if (whole >= size) return `${(whole / size).toFixed(2)}${tag}`;
  return whole.toFixed(whole < 10 ? 4 : 2).replace(/\.?0+$/, "");
}

export function ratioText(bps: number): string {
  return `${(bps / 100).toFixed(2)}%`;
}

export function short(s: string, head = 6, tail = 4): string {
  return s.length > head + tail + 1 ? `${s.slice(0, head)}…${s.slice(-tail)}` : s;
}

export function withZeroX(hex: string): string {
  return hex.startsWith("0x") ? hex : `0x${hex}`;
}

export function ago(seconds: number, now = Math.floor(Date.now() / 1000)): string {
  const d = Math.max(0, now - seconds);
  if (d < 90) return "just now";
  if (d < 3600) return `${Math.round(d / 60)} min ago`;
  if (d < 86400) return `${Math.round(d / 3600)} h ago`;
  return `${Math.round(d / 86400)} d ago`;
}

export function clock(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h > 0 ? `${h} h ${String(m).padStart(2, "0")} min` : `${m}:${String(s % 60).padStart(2, "0")}`;
}
