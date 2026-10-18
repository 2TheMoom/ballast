import Link from "next/link";

/** The Ballast mark: a beam tilted on a pivot. */
export function Mark({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={Math.round((size * 26) / 30)} viewBox="0 0 30 26" fill="none" role="img" aria-label="Ballast mark">
      <path d="M3 9 L27 5" stroke="var(--ink)" strokeWidth="3" strokeLinecap="round" />
      <path d="M15 7 L9 23 H21 Z" fill="var(--cobalt)" />
    </svg>
  );
}

export function Brand({ href = "/" }: { href?: string }) {
  return (
    <Link href={href} className="b-brand" aria-label="Ballast home">
      <Mark />
      <span>Ballast</span>
    </Link>
  );
}
