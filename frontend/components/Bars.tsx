import type { HistoryPoint } from "@/lib/contracts/types";
import { ratioText } from "@/lib/units";

const LOW = 9600;
const HIGH = 10600;
const H = 160;

/** The last attestations as bars from 96% to 106%, with the monitor's floor drawn across. The newest bar is dark. */
export function Bars({ points, floorBps }: { points: HistoryPoint[]; floorBps: number }) {
  const at = (bps: number) => Math.max(2, Math.min(H, ((bps - LOW) / (HIGH - LOW)) * H));
  return (
    <div>
      <div className="b-bars" role="img" aria-label={`The last ${points.length} attestations, from ${points.length ? ratioText(points[0].ratioBps) : "none"} to ${points.length ? ratioText(points[points.length - 1].ratioBps) : "none"}`}>
        <div className="floor" style={{ bottom: at(floorBps) }} />
        {points.map((p, i) => (
          <div
            key={p.seq}
            className={`bar${p.ratioBps < floorBps ? " short" : ""}${i === points.length - 1 ? " last" : ""}`}
            style={{ height: at(p.ratioBps) }}
            title={`#${p.seq}: ${ratioText(p.ratioBps)}${p.disputed ? " (disputed)" : ""}`}
          />
        ))}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "var(--slate)", marginTop: 8 }}>
        <span>{points.length ? `${points.length} attestation${points.length === 1 ? "" : "s"} back` : ""}</span>
        <span style={{ color: "var(--signal-ink)" }}>{ratioText(floorBps)} floor</span>
        <span>latest</span>
      </div>
    </div>
  );
}
