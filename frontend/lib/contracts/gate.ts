import { createClient } from "genlayer-js";
import { getGenLayerChain } from "../genlayer/chains";
import { getStudioUrl } from "../genlayer/client";
import { plain } from "./decode";

export interface GateState {
  ballast: string;
  monitorId: string;
  maxAge: number;
  performed: number;
  lastNote: string;
  lastBy: string;
  lastAt: number;
}

/** The GateExample consumer's own record: how many times it acted, and the last note. Read only. */
export async function readGateState(address: string): Promise<GateState> {
  const client: any = createClient({ chain: getGenLayerChain(), endpoint: getStudioUrl() });
  const o = plain(await client.readContract({ address: address as `0x${string}`, functionName: "get_state", args: [] }));
  return {
    ballast: String(o.ballast ?? ""),
    monitorId: String(o.monitor_id ?? ""),
    maxAge: Number(o.max_age ?? 0),
    performed: Number(o.performed ?? 0),
    lastNote: String(o.last_note ?? ""),
    lastBy: String(o.last_by ?? ""),
    lastAt: Number(o.last_at ?? 0),
  };
}
