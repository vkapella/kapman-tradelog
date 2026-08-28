"use client";

import { useEffect, useMemo, useState } from "react";
import { compareDataRevisions } from "@/lib/accounts/data-revision";
import { applyAccountIdsToSearchParams } from "@/lib/api/account-scope";
import type {
  PositionSnapshotApiResponse,
  PositionSnapshotComputeApiResponse,
  PositionSnapshotResponseData,
} from "@/types/api";

export const POSITION_SNAPSHOT_STALE_THRESHOLD_SECONDS = 3600;

interface PositionSnapshotMeta {
  snapshotExists: boolean;
  snapshotAge?: number;
  currentDataRevisions?: Record<string, string>;
}

interface UsePositionSnapshotResult {
  snapshot: PositionSnapshotResponseData | null;
  loading: boolean;
  stale: boolean;
  computing: boolean;
  error: string | null;
  /** Accounts whose source data changed since this snapshot was computed --
   *  the currency check (#339): stored inputsRevision behind the account's
   *  live data revision. Empty when unknown (legacy rows carry no revision). */
  staleDataAccountIds: string[];
  triggerCompute: () => Promise<void>;
}

export function usePositionSnapshot(accountIds: string[]): UsePositionSnapshotResult {
  const normalizedAccountIds = useMemo(
    () => Array.from(new Set(accountIds.map((value) => value.trim()).filter((value) => value.length > 0))).sort((left, right) => left.localeCompare(right)),
    [accountIds],
  );
  const accountScopeKey = normalizedAccountIds.join(",");
  const [snapshot, setSnapshot] = useState<PositionSnapshotResponseData | null>(null);
  const [meta, setMeta] = useState<PositionSnapshotMeta>({ snapshotExists: false });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pollToken, setPollToken] = useState(0);
  // `activeSnapshotId` pins which snapshot is displayed; `awaitingSnapshotId` tracks
  // the compute still in flight. They are separate because a finished compute must
  // stay pinned -- re-querying "latest for this scope" after it completed is what
  // used to discard the fresh result and snap the widget back to an older row.
  const [activeSnapshotId, setActiveSnapshotId] = useState<string | null>(null);
  const [awaitingSnapshotId, setAwaitingSnapshotId] = useState<string | null>(null);

  useEffect(() => {
    setSnapshot(null);
    setMeta({ snapshotExists: false });
    setError(null);
    setLoading(true);
    setPollToken(0);
    setActiveSnapshotId(null);
    setAwaitingSnapshotId(null);
  }, [accountScopeKey]);

  useEffect(() => {
    const controller = new AbortController();

    async function loadSnapshot(): Promise<void> {
      setLoading(true);
      setError(null);

      try {
        const query = new URLSearchParams();
        if (activeSnapshotId) {
          query.set("snapshotId", activeSnapshotId);
        } else {
          applyAccountIdsToSearchParams(query, normalizedAccountIds);
        }

        const response = await fetch(`/api/positions/snapshot?${query.toString()}`, {
          cache: "no-store",
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error("Unable to load position snapshot.");
        }

        const payload = (await response.json()) as PositionSnapshotApiResponse;
        if ("error" in payload) {
          throw new Error(payload.error.message);
        }

        const data = payload.data;
        setSnapshot(data);
        setMeta(payload.meta);

        if (data?.status === "PENDING") {
          setActiveSnapshotId(data.id);
          setAwaitingSnapshotId(data.id);
          return;
        }

        if (data) {
          // Functional update so `awaitingSnapshotId` need not be an effect dependency.
          setAwaitingSnapshotId((current) => (current === data.id ? null : current));
        }

        // A failed compute is worth nothing to display, so fall back to the last
        // snapshot that did succeed instead of pinning the failure.
        if (data?.status === "FAILED") {
          setActiveSnapshotId(null);
        }
      } catch (loadError) {
        if (controller.signal.aborted) {
          return;
        }

        setSnapshot(null);
        setMeta({ snapshotExists: false });
        setError(loadError instanceof Error ? loadError.message : "Unable to load position snapshot.");
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }

    void loadSnapshot();

    return () => {
      controller.abort();
    };
  }, [activeSnapshotId, normalizedAccountIds, pollToken]);

  useEffect(() => {
    if (snapshot?.status !== "PENDING" && awaitingSnapshotId === null) {
      return;
    }

    const intervalId = window.setInterval(() => {
      setPollToken((current) => current + 1);
    }, 2000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [awaitingSnapshotId, snapshot?.status]);

  async function triggerCompute(): Promise<void> {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/positions/snapshot/compute", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ accountIds: normalizedAccountIds }),
      });

      if (!response.ok) {
        throw new Error("Unable to start position snapshot compute.");
      }

      const payload = (await response.json()) as PositionSnapshotComputeApiResponse;
      if ("error" in payload) {
        throw new Error(payload.error.message);
      }

      setActiveSnapshotId(payload.data.snapshotId);
      setAwaitingSnapshotId(payload.data.snapshotId);
      setPollToken((current) => current + 1);
    } catch (computeError) {
      setLoading(false);
      setError(computeError instanceof Error ? computeError.message : "Unable to start position snapshot compute.");
    }
  }

  const staleDataAccountIds = useMemo(() => {
    if (!snapshot || !meta.currentDataRevisions) {
      return [];
    }
    return snapshot.accountValues
      .filter((value) => {
        const comparison = compareDataRevisions(value.inputsRevision ?? null, meta.currentDataRevisions?.[value.accountId] ?? null);
        return comparison !== null && comparison < 0;
      })
      .map((value) => value.accountId);
  }, [snapshot, meta.currentDataRevisions]);

  return {
    snapshot,
    loading,
    stale: Boolean(meta.snapshotAge && meta.snapshotAge > POSITION_SNAPSHOT_STALE_THRESHOLD_SECONDS),
    computing: snapshot?.status === "PENDING" || awaitingSnapshotId !== null,
    error,
    staleDataAccountIds,
    triggerCompute,
  };
}
