import { compactUnits, ratioText } from "@/lib/units";

/**
 * The balance beam: reserves on the left pan, liabilities on the right. The beam tilts toward the heavier side, up to 4 degrees, so a
 * shortfall is visible before it is read. All numbers come from one attestation.
 */
export function Beam({
  reservesTotal,
  liabilities,
  decimals,
  ratioBps,
  tone,
  reserveNote,
  liabilityNote,
}: {
  reservesTotal: string;
  liabilities: string;
  decimals: number;
  ratioBps: number;
  tone: "covered" | "short" | "stale" | "disputed" | "none";
  reserveNote: string;
  liabilityNote: string;
}) {
  const deg = -Math.max(-4, Math.min(4, ((ratioBps - 10000) / 10000) * 40));
  const dy = -deg * 3.5;
  const color = tone === "short" ? "var(--signal-ink)" : tone === "covered" ? "var(--moss)" : "var(--slate)";
  return (
    <div className="b-beam" role="img" aria-label={`Reserves ${compactUnits(reservesTotal, decimals)}, liabilities ${compactUnits(liabilities, decimals)}, ratio ${ratioText(ratioBps)}`}>
      <div className="bar" style={{ transform: `rotate(${deg}deg)` }} />
      <div className="pivot" />
      <div className="pan res" style={{ top: 93 + dy }}>
        <div className="k">Reserves</div>
        <div className="v">{compactUnits(reservesTotal, decimals)}</div>
        <div className="s">{reserveNote}</div>
      </div>
      <div className="pan lia" style={{ top: 93 - dy }}>
        <div className="k">Liabilities</div>
        <div className="v">{compactUnits(liabilities, decimals)}</div>
        <div className="s">{liabilityNote}</div>
      </div>
      <div className="ratio" style={{ color }}>{ratioText(ratioBps)}</div>
    </div>
  );
}
