import { STATE_LABEL, type MonitorState } from "@/lib/status";

export function StatusChip({ state }: { state: MonitorState }) {
  return <span className={`b-chip ${state}`}>{STATE_LABEL[state]}</span>;
}
