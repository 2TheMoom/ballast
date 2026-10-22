"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import Ballast, { type ChallengeArgs, type RegisterArgs } from "../contracts/Ballast";
import { getContractAddress, getStudioUrl } from "../genlayer/client";
import { useWallet } from "../genlayer/wallet";
import { success, error, info } from "../utils/toast";
import { addPendingWrite, settlePendingWrite, takeRestoredWrites, releaseRestoredWrites } from "../finality-store";
import { failedReceiptMessage } from "../receipt";
import type { Attestation, Challenge, HistoryPoint, Latest, Monitor, WriteProgress } from "../contracts/types";
import { NETWORK } from "../genlayer/network";

export type { WriteProgress };

/** The contract client, or null while NEXT_PUBLIC_CONTRACT_ADDRESS is not set. */
export function useBallastContract(): Ballast | null {
  const { address } = useWallet();
  const contract = getContractAddress();
  const rpcUrl = getStudioUrl();
  return useMemo(() => (contract ? new Ballast(contract, address, rpcUrl) : null), [contract, address, rpcUrl]);
}

const POLL = 20000;

export interface MonitorRow {
  monitor: Monitor;
  latest: Latest;
}

/** Every monitor with its latest attestation summary. Reads one list, then one small record per monitor. */
export function useMonitorList() {
  const c = useBallastContract();
  return useQuery<MonitorRow[], Error>({
    queryKey: ["monitorList"],
    queryFn: async () => {
      const ids = await c!.getMonitorIds();
      const rows = await Promise.all(
        ids.map(async (id) => {
          const [monitor, latest] = await Promise.all([c!.getMonitor(id), c!.getLatest(id)]);
          return monitor ? { monitor, latest } : null;
        })
      );
      return rows.filter((r): r is MonitorRow => r !== null);
    },
    enabled: !!c,
    refetchInterval: POLL,
    refetchOnWindowFocus: true,
    staleTime: 2000,
  });
}

export function useMonitor(id: string) {
  const c = useBallastContract();
  return useQuery<Monitor | null, Error>({
    queryKey: ["monitor", id],
    queryFn: () => c!.getMonitor(id),
    enabled: !!c && !!id,
    refetchInterval: POLL,
    refetchOnWindowFocus: true,
    staleTime: 2000,
  });
}

export function useLatest(id: string) {
  const c = useBallastContract();
  return useQuery<Latest, Error>({
    queryKey: ["latest", id],
    queryFn: () => c!.getLatest(id),
    enabled: !!c && !!id,
    refetchInterval: POLL,
    staleTime: 2000,
  });
}

export function useAttestation(id: string, seq: number) {
  const c = useBallastContract();
  return useQuery<Attestation | null, Error>({
    queryKey: ["attestation", id, seq],
    queryFn: () => c!.getAttestation(id, seq),
    enabled: !!c && !!id && seq > 0,
    refetchInterval: POLL,
    staleTime: 2000,
  });
}

export function useHistory(id: string) {
  const c = useBallastContract();
  return useQuery<HistoryPoint[], Error>({
    queryKey: ["history", id],
    queryFn: () => c!.getHistory(id),
    enabled: !!c && !!id,
    refetchInterval: POLL,
    staleTime: 2000,
  });
}

/** The newest few challenges of a monitor, newest first. */
export function useChallenges(id: string, total: number, limit = 5) {
  const c = useBallastContract();
  return useQuery<Challenge[], Error>({
    queryKey: ["challenges", id, total],
    queryFn: async () => {
      const nums = Array.from({ length: Math.min(limit, total) }, (_, i) => total - i);
      const rows = await Promise.all(nums.map((n) => c!.getChallenge(id, n)));
      return rows.filter((r): r is Challenge => r !== null);
    },
    enabled: !!c && !!id && total > 0,
    refetchInterval: POLL,
    staleTime: 2000,
  });
}

/**
 * After a reload, writes that were recorded but not final come back from storage. Nobody is waiting on them any more, so watch them
 * here until each transaction really finalizes (or fails), then say so and refresh what the page shows.
 */
export function useResumeFinality(id: string) {
  const c = useBallastContract();
  const queryClient = useQueryClient();
  useEffect(() => {
    if (!c || !id) return;
    const todo = takeRestoredWrites(id);
    if (todo.length === 0) return;
    let stopped = false;
    const open = new Set(todo.map((w) => w.txHash));
    todo.forEach((w) => {
      (async () => {
        while (!stopped) {
          try {
            const s = await c.txStatus(w.txHash);
            if (s.status === "FINALIZED") {
              const failure = failedReceiptMessage(s.receipt, w.label, w.txHash);
              settlePendingWrite(id, w.txHash, failure ?? undefined);
              open.delete(w.txHash);
              queryClient.invalidateQueries();
              return;
            }
          } catch {
            // the network blinked: try again
          }
          await new Promise((r) => setTimeout(r, 20000));
        }
      })();
    });
    return () => {
      stopped = true;
      releaseRestoredWrites(todo.filter((w) => open.has(w.txHash)));
    };
  }, [c, id, queryClient]);
}

interface Messages {
  recorded: { title: string; description: string };
}

type Runner<TArgs> = (c: Ballast, args: TArgs, onProgress: (p: WriteProgress) => void) => Promise<string>;

/** One write at a time, with its progress, a "recorded, not final" note kept until finality, and everything refreshed afterwards. */
function useWriteAction<TArgs>(action: Runner<TArgs>, messages: Messages, errorTitle: string, getSubject: (args: TArgs) => string) {
  const c = useBallastContract();
  const { address } = useWallet();
  const queryClient = useQueryClient();
  const [isPending, setIsPending] = useState(false);
  const [progress, setProgress] = useState<(WriteProgress & { at: number }) | null>(null);

  const refresh = () => queryClient.invalidateQueries();

  const mutation = useMutation({
    mutationFn: async (args: TArgs) => {
      if (!c) throw new Error("The contract is not configured. Set NEXT_PUBLIC_CONTRACT_ADDRESS.");
      if (!address) throw new Error("Wallet not connected. Connect your wallet first.");
      setIsPending(true);
      setProgress(null);
      const subject = getSubject(args);
      return action(c, args, (p) => {
        setProgress({ ...p, at: Date.now() });
        if (p.stage === "confirmed" && p.txHash) addPendingWrite(subject, { label: messages.recorded.title, txHash: p.txHash, since: Date.now() });
        if (p.stage === "finalized" && p.txHash) {
          settlePendingWrite(subject, p.txHash);
          refresh();
          success(`${messages.recorded.title}, final`, { description: "The transaction finalized with a successful result and the state shows it." });
        } else if (p.stage === "failed" && p.txHash) {
          settlePendingWrite(subject, p.txHash, p.message || "Did not finalize as expected.");
          refresh();
          error(`${messages.recorded.title}: not final`, { description: p.message || "The transaction did not finalize as expected." });
        }
      });
    },
    onSuccess: () => {
      refresh();
      setIsPending(false);
      info(`${messages.recorded.title}: recorded, waiting for finality`, {
        description: `${messages.recorded.description} It counts as final once the transaction finalizes (${NETWORK.finality} on ${NETWORK.short}).`,
        duration: 8000,
      });
    },
    onError: (err: any) => {
      console.error(errorTitle, err);
      setIsPending(false);
      setProgress(null);
      error(errorTitle, { description: err?.message || "Please try again." });
    },
  });

  return { ...mutation, isPending, progress, clearProgress: () => setProgress(null), run: mutation.mutate, runAsync: mutation.mutateAsync };
}

export function useRegister() {
  return useWriteAction<RegisterArgs>(
    (c, a, onProgress) => c.register(a, onProgress),
    { recorded: { title: "Monitor registered", description: "It exists now. Nobody has attested it yet, so it reads as not attested." } },
    "Failed to register the monitor",
    (a) => a.id
  );
}

export function useAttest() {
  return useWriteAction<{ id: string }>(
    (c, a, onProgress) => c.attest(a.id, onProgress),
    { recorded: { title: "Attestation recorded", description: "Validators read the reserves and the supply at pinned blocks and agreed exactly." } },
    "Failed to attest",
    (a) => a.id
  );
}

export function useChallenge() {
  return useWriteAction<ChallengeArgs>(
    (c, a, onProgress) => c.challenge(a, onProgress),
    { recorded: { title: "Challenge recorded", description: "The current attestation is disputed until a newer one is recorded." } },
    "Failed to challenge",
    (a) => a.id
  );
}

export function useAddReserve() {
  return useWriteAction<{ id: string; chain: string; asset: string; holder: string; label: string }>(
    (c, a, onProgress) => c.addReserve(a.id, a, onProgress),
    { recorded: { title: "Reserve address added", description: "It counts from the next attestation." } },
    "Failed to add the address",
    (a) => a.id
  );
}

export function useScheduleRemoval() {
  return useWriteAction<{ id: string; chain: string; asset: string; holder: string }>(
    (c, a, onProgress) => c.scheduleRemoval(a.id, a, onProgress),
    { recorded: { title: "Removal scheduled", description: "It takes effect 24 hours from now, in public." } },
    "Failed to schedule the removal",
    (a) => a.id
  );
}

export function useCancelRemoval() {
  return useWriteAction<{ id: string; chain: string; asset: string; holder: string }>(
    (c, a, onProgress) => c.cancelRemoval(a.id, a, onProgress),
    { recorded: { title: "Removal cancelled", description: "The address stays." } },
    "Failed to cancel the removal",
    (a) => a.id
  );
}

export function useApplyRemoval() {
  return useWriteAction<{ id: string; chain: string; asset: string; holder: string }>(
    (c, a, onProgress) => c.applyRemoval(a.id, a, onProgress),
    { recorded: { title: "Address removed", description: "It no longer counts toward the reserves." } },
    "Failed to apply the removal",
    (a) => a.id
  );
}
