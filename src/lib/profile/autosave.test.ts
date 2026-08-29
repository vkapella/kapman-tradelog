// #344: the autosave state machine, exercised deterministically with a manual
// scheduler and a controllable send. Covers the acknowledgement/revert cases
// from the spec: revert during flight, ambiguous delivery (mustConfirm),
// coalescing, no-op suppression, reset ordering, backoff retries without
// further edits, and the pagehide journal-first keepalive path.

import { describe, expect, it } from "vitest";
import { ProfileAutosave, type AutosaveSendResult } from "@/lib/profile/autosave";
import type { ProfileJournalEntryV1 } from "@/lib/profile/local";
import type { ProfilePatchV1, ProfilePutResponse } from "@/types/api";

interface PendingSend {
  patch: ProfilePatchV1;
  keepalive: boolean;
  resolve: (result: AutosaveSendResult) => void;
}

function okResponse(): ProfilePutResponse {
  return {
    settings: {
      version: 1,
      accounts: { selected: ["18528700SCHW"] },
      range: { preset: "kapman-start", startDate: null, endDate: null },
      dashboard: { widgets: null, kpis: null },
      tables: { hiddenColumns: {} },
    },
    revision: "1",
    updatedAt: "2026-08-29T00:00:00.000Z",
  };
}

function harness() {
  const sends: PendingSend[] = [];
  const timers: Array<{ fn: () => void; ms: number; cancelled: boolean }> = [];
  let journal: Record<string, ProfileJournalEntryV1> = {};
  const journalWrites: Array<Record<string, ProfileJournalEntryV1>> = [];
  let identityChanged = 0;
  const successes: ProfilePutResponse[] = [];

  const machine = new ProfileAutosave(
    {
      send(patch, { keepalive }) {
        return new Promise<AutosaveSendResult>((resolve) => {
          sends.push({ patch, keepalive, resolve });
        });
      },
      onSuccess(response) {
        successes.push(response);
      },
      onIdentityChanged() {
        identityChanged += 1;
      },
      writeJournal(entries) {
        journal = entries;
        journalWrites.push(entries);
      },
      schedule(fn, ms) {
        const timer = { fn, ms, cancelled: false };
        timers.push(timer);
        return () => {
          timer.cancelled = true;
        };
      },
      now: () => "2026-08-29T00:00:00.000Z",
    },
    { debounceMs: 1500, backoffBaseMs: 2000, backoffCapMs: 60000 },
  );

  async function fireNextTimer(): Promise<{ ms: number } | null> {
    const timer = timers.find((candidate) => !candidate.cancelled && !("fired" in candidate));
    if (!timer) return null;
    (timer as { fired?: boolean }).fired = true;
    timer.fn();
    // Let the async flush reach its await point.
    await Promise.resolve();
    return { ms: timer.ms };
  }

  async function completeSend(index: number, result: AutosaveSendResult): Promise<void> {
    sends[index].resolve(result);
    // Drain the microtask queue so the machine processes the result.
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  }

  return {
    machine,
    sends,
    timers,
    fireNextTimer,
    completeSend,
    get journal() {
      return journal;
    },
    journalWrites,
    get identityChanged() {
      return identityChanged;
    },
    successes,
  };
}

describe("ProfileAutosave", () => {
  it("initial hydration produces zero sends", async () => {
    const h = harness();
    h.machine.hydrate("accounts", ["A"]);
    h.machine.hydrate("range", { preset: "kapman-start", startDate: null, endDate: null });
    h.machine.setEnabled(true);
    expect(h.timers.length).toBe(0);
    expect(h.sends.length).toBe(0);
  });

  it("coalesces multi-key edits into one patch and suppresses no-ops", async () => {
    const h = harness();
    h.machine.hydrate("accounts", ["A"]);
    h.machine.hydrate("dashboard.kpis", null);
    h.machine.setEnabled(true);

    h.machine.edit("accounts", ["B"]);
    h.machine.edit("dashboard.kpis", ["realized-pnl"]);
    h.machine.edit("accounts", ["A"]); // reverted before any send: pure no-op

    await h.fireNextTimer();
    expect(h.sends.length).toBe(1);
    // accounts suppressed (desired equals confirmed, nothing uncertain);
    // only the KPI leaf is sent.
    expect(h.sends[0].patch).toEqual({ dashboard: { kpis: ["realized-pnl"] } });
  });

  it("revert during flight: baseline advances to the sent value and the revert IS sent", async () => {
    const h = harness();
    h.machine.hydrate("accounts", ["A"]);
    h.machine.setEnabled(true);

    h.machine.edit("accounts", ["B"]);
    await h.fireNextTimer();
    expect(h.sends.length).toBe(1);
    expect(h.sends[0].patch).toEqual({ accounts: { selected: ["B"] } });

    // While B is in flight, the user reverts to A.
    h.machine.edit("accounts", ["A"]);

    await h.completeSend(0, { kind: "ok", response: okResponse() });

    // confirmedWritten is now B; desired A differs; the follow-up flush sends A.
    await h.fireNextTimer();
    expect(h.sends.length).toBe(2);
    expect(h.sends[1].patch).toEqual({ accounts: { selected: ["A"] } });

    await h.completeSend(1, { kind: "ok", response: okResponse() });
    expect(h.machine.dirtyKeys()).toEqual([]);
  });

  it("ambiguous delivery: after a lost response, a revert to the old value is still sent", async () => {
    const h = harness();
    h.machine.hydrate("accounts", ["A"]);
    h.machine.setEnabled(true);

    h.machine.edit("accounts", ["B"]);
    await h.fireNextTimer();
    await h.completeSend(0, { kind: "retryable" }); // dispatched, response lost

    // mustConfirm is set and persisted to the journal.
    expect(h.journal.accounts?.mustConfirm).toBe(true);

    // The user reverts to A — equal to the OLD confirmed baseline.
    h.machine.edit("accounts", ["A"]);
    await h.fireNextTimer();

    // NOT suppressed: the server may hold B.
    expect(h.sends.length).toBe(2);
    expect(h.sends[1].patch).toEqual({ accounts: { selected: ["A"] } });

    await h.completeSend(1, { kind: "ok", response: okResponse() });
    expect(h.machine.dirtyKeys()).toEqual([]);
    expect(h.journal).toEqual({});
  });

  it("retries automatically with backoff after a failure, with NO further edit", async () => {
    const h = harness();
    h.machine.hydrate("range", { preset: "kapman-start", startDate: null, endDate: null });
    h.machine.setEnabled(true);

    h.machine.edit("range", { preset: "ytd", startDate: null, endDate: null });
    const debounce = await h.fireNextTimer();
    expect(debounce?.ms).toBe(1500);
    await h.completeSend(0, { kind: "retryable" });

    const retry1 = await h.fireNextTimer();
    expect(retry1?.ms).toBe(2000); // backoff, not debounce
    await h.completeSend(1, { kind: "retryable" });

    const retry2 = await h.fireNextTimer();
    expect(retry2?.ms).toBe(4000);
    // Retries rebuild from current desired — same value here, never a stale payload.
    expect(h.sends[2].patch).toEqual({ range: { preset: "ytd", startDate: null, endDate: null } });

    await h.completeSend(2, { kind: "ok", response: okResponse() });
    expect(h.machine.dirtyKeys()).toEqual([]);
  });

  it("a stale failed payload never overwrites a newer desired value", async () => {
    const h = harness();
    h.machine.hydrate("dashboard.kpis", null);
    h.machine.setEnabled(true);

    h.machine.edit("dashboard.kpis", ["a"]);
    await h.fireNextTimer();
    h.machine.edit("dashboard.kpis", ["a", "b"]); // newer value while ["a"] is in flight
    await h.completeSend(0, { kind: "retryable" });

    await h.fireNextTimer();
    // The retry carries the CURRENT desired value, not the failed payload.
    expect(h.sends[1].patch).toEqual({ dashboard: { kpis: ["a", "b"] } });
  });

  it("reset supersedes queued values and is ordered after the in-flight write", async () => {
    const h = harness();
    h.machine.hydrate("dashboard.widgets", null);
    h.machine.hydrate("tables.hiddenColumns.executions", ["fees"]);
    h.machine.setEnabled(true);

    h.machine.edit("dashboard.widgets", [{ widgetId: "equity-curve", colSpan: 2 }]);
    await h.fireNextTimer();
    expect(h.sends.length).toBe(1);

    // Reset while the widget edit is in flight: defaults + table-leaf deletes.
    h.machine.edit("dashboard.widgets", null);
    h.machine.edit("tables.hiddenColumns.executions", null);

    await h.completeSend(0, { kind: "ok", response: okResponse() });
    await h.fireNextTimer();

    expect(h.sends.length).toBe(2); // serialized: reset went AFTER the in-flight write
    expect(h.sends[1].patch).toEqual({
      dashboard: { widgets: null },
      tables: { hiddenColumns: { executions: null } },
    });
  });

  it("pagehide with no request in flight: journal written synchronously BEFORE one keepalive send", async () => {
    const h = harness();
    h.machine.hydrate("accounts", ["A"]);
    h.machine.setEnabled(true);
    h.machine.edit("accounts", ["B"]);

    h.machine.handlePageHide();

    // Journal write happened before the send dispatched.
    expect(h.journalWrites.length).toBeGreaterThan(0);
    expect(h.journal.accounts?.value).toEqual(["B"]);
    expect(h.journal.accounts?.mustConfirm).toBe(true);

    await Promise.resolve();
    expect(h.sends.length).toBe(1);
    expect(h.sends[0].keepalive).toBe(true);
  });

  it("pagehide during an in-flight request: journal only, NO second request", async () => {
    const h = harness();
    h.machine.hydrate("accounts", ["A"]);
    h.machine.setEnabled(true);

    h.machine.edit("accounts", ["B"]);
    await h.fireNextTimer();
    expect(h.sends.length).toBe(1);

    h.machine.handlePageHide();
    await Promise.resolve();

    expect(h.sends.length).toBe(1); // no concurrent keepalive
    expect(h.journal.accounts?.value).toEqual(["B"]);
  });

  it("identity change: journals under way, disables, and notifies exactly once", async () => {
    const h = harness();
    h.machine.hydrate("accounts", ["A"]);
    h.machine.setEnabled(true);

    h.machine.edit("accounts", ["B"]);
    await h.fireNextTimer();
    await h.completeSend(0, { kind: "identity_changed" });

    expect(h.identityChanged).toBe(1);
    expect(h.machine.isEnabled()).toBe(false);
    expect(h.journal.accounts?.value).toEqual(["B"]);
  });

  it("unsupported version: autosave disabled for the session", async () => {
    const h = harness();
    h.machine.hydrate("accounts", ["A"]);
    h.machine.setEnabled(true);

    h.machine.edit("accounts", ["B"]);
    await h.fireNextTimer();
    await h.completeSend(0, { kind: "unsupported_version" });

    expect(h.machine.isEnabled()).toBe(false);
    expect(h.sends.length).toBe(1);
  });

  it("restored journal entries flush once enabled", async () => {
    const h = harness();
    h.machine.hydrate("accounts", ["A"]);
    h.machine.restoreJournalEntry("accounts", ["B"], true);
    h.machine.setEnabled(true);

    await h.fireNextTimer();
    expect(h.sends.length).toBe(1);
    expect(h.sends[0].patch).toEqual({ accounts: { selected: ["B"] } });
  });
});
