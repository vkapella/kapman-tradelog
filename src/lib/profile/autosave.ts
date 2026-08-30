// Autosave state machine (#344, spec §2f). Framework-free and fully
// injectable (send + timers) so every ordering case is deterministic in tests.
//
// Per leaf key K: desired[K], confirmedWritten[K] (best knowledge of what the
// server holds), generation counter gen[K], dirty flag, and mustConfirm[K]
// (ambiguous-delivery flag). Writes are SERIALIZED — one in-flight request.
//
// The two rules that make reverts safe:
// 1. On SUCCESS, confirmedWritten[K] is ALWAYS set to the sent value, even
//    when K was edited during flight — generation equality controls only
//    whether dirty clears. A revert to the pre-flight value therefore differs
//    from the new baseline and is sent, never swallowed by suppression.
// 2. On any dispatched-but-unacknowledged outcome, mustConfirm[K] is set and
//    suspends no-op suppression until the server provably holds the current
//    desired value (matching-generation ack, or a fresh GET equality check).

import { buildPatchFromLeaves, leafEqual } from "@/lib/profile/leaves";
import type { ProfileJournalEntryV1 } from "@/lib/profile/local";
import type { ProfilePatchV1, ProfilePutResponse } from "@/types/api";

export type AutosaveSendResult =
  | { kind: "ok"; response: ProfilePutResponse }
  | { kind: "identity_changed" }
  | { kind: "unsupported_version" }
  /** Permanent server rejection (400/413): the write will never succeed as
   *  sent. No automatic retries for the rejected generations; a subsequent
   *  user edit re-attempts with the new value. */
  | { kind: "rejected" }
  /** Authentication/session failure (401/403): journal, halt, reload so
   *  Cloudflare Access can re-establish identity. */
  | { kind: "auth_failed" }
  /** Transient (network/5xx/409 CONFLICT/429): retry with backoff. */
  | { kind: "retryable" };

export interface AutosaveDeps {
  send(patch: ProfilePatchV1, opts: { keepalive: boolean }): Promise<AutosaveSendResult>;
  /** Cache update with the full server-returned canonical document. */
  onSuccess(response: ProfilePutResponse): void;
  /** Journal already written; the provider forces a full reload. Also used
   *  for auth failures — both mean this session can no longer save. */
  onIdentityChanged(): void;
  /** A permanent rejection happened — surface the quiet inline note. */
  onPermanentRejection?(): void;
  /** Synchronous journal write (empty record deletes the key). */
  writeJournal(entries: Record<string, ProfileJournalEntryV1>): void;
  /** Injectable timer; returns a cancel function. Defaults to setTimeout. */
  schedule?(fn: () => void, ms: number): () => void;
  now?(): string;
}

export interface AutosaveOptions {
  debounceMs?: number;
  backoffBaseMs?: number;
  backoffCapMs?: number;
}

interface LeafState {
  desired: unknown;
  confirmedWritten: unknown;
  gen: number;
  dirty: boolean;
  mustConfirm: boolean;
  /** Generation the server permanently rejected (400/413). While the current
   *  generation equals it, the leaf is excluded from sends — only a NEW user
   *  edit (gen bump) makes it sendable again. */
  rejectedGen: number | null;
  editedAt: string;
}

const DEBOUNCE_MS = 1500;
const BACKOFF_BASE_MS = 2000;
const BACKOFF_CAP_MS = 60000;

export class ProfileAutosave {
  private readonly deps: AutosaveDeps;
  private readonly debounceMs: number;
  private readonly backoffBaseMs: number;
  private readonly backoffCapMs: number;

  private readonly leaves = new Map<string, LeafState>();
  private enabled = false;
  private inFlight = false;
  private flushRequested = false;
  private backoffAttempt = 0;
  private cancelTimer: (() => void) | null = null;

  constructor(deps: AutosaveDeps, options: AutosaveOptions = {}) {
    this.deps = deps;
    this.debounceMs = options.debounceMs ?? DEBOUNCE_MS;
    this.backoffBaseMs = options.backoffBaseMs ?? BACKOFF_BASE_MS;
    this.backoffCapMs = options.backoffCapMs ?? BACKOFF_CAP_MS;
  }

  private schedule(fn: () => void, ms: number): () => void {
    if (this.deps.schedule) return this.deps.schedule(fn, ms);
    const id = setTimeout(fn, ms);
    return () => clearTimeout(id);
  }

  private now(): string {
    return this.deps.now ? this.deps.now() : new Date().toISOString();
  }

  private leaf(key: string): LeafState {
    let state = this.leaves.get(key);
    if (!state) {
      state = {
        desired: undefined,
        confirmedWritten: undefined,
        gen: 0,
        dirty: false,
        mustConfirm: false,
        rejectedGen: null,
        editedAt: "",
      };
      this.leaves.set(key, state);
    }
    return state;
  }

  /** Hydration path: desired = confirmedWritten = value; never dirty. */
  hydrate(key: string, value: unknown): void {
    const state = this.leaf(key);
    state.desired = value;
    state.confirmedWritten = value;
    state.dirty = false;
    state.mustConfirm = false;
  }

  /** A fresh GET proved the server holds `value` for this leaf. */
  confirmFromServer(key: string, value: unknown): void {
    const state = this.leaf(key);
    state.confirmedWritten = value;
    if (!state.dirty || leafEqual(key, state.desired, value)) {
      state.dirty = false;
      state.mustConfirm = false;
    }
  }

  /** User-originated edit: dirties the leaf and (re)starts the debounce. */
  edit(key: string, value: unknown): void {
    const state = this.leaf(key);
    state.desired = value;
    state.gen += 1;
    state.dirty = true;
    state.editedAt = this.now();
    if (!this.enabled) return;
    this.startTimer(this.debounceMs);
  }

  /** Journal restore: a prior session's unacknowledged edit, re-applied. */
  restoreJournalEntry(key: string, value: unknown, mustConfirm: boolean): void {
    const state = this.leaf(key);
    state.desired = value;
    state.gen += 1;
    state.dirty = true;
    state.mustConfirm = mustConfirm;
    state.editedAt = this.now();
  }

  /** Enable after hydration; flushes any restored journal entries soon. */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (enabled && this.hasWork()) {
      this.startTimer(this.debounceMs);
    }
    if (!enabled) {
      this.clearTimer();
    }
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  getDesired(key: string): unknown {
    return this.leaves.get(key)?.desired;
  }

  dirtyKeys(): string[] {
    return Array.from(this.leaves.entries())
      .filter(([, state]) => state.dirty)
      .map(([key]) => key);
  }

  /** Every leaf this machine has ever tracked (for reset enumeration). */
  knownKeys(): string[] {
    return Array.from(this.leaves.keys());
  }

  private hasWork(): boolean {
    return Array.from(this.leaves.entries()).some(
      ([key, state]) =>
        state.dirty &&
        state.rejectedGen !== state.gen &&
        (state.mustConfirm || !leafEqual(key, state.desired, state.confirmedWritten)),
    );
  }

  private startTimer(ms: number): void {
    this.clearTimer();
    this.cancelTimer = this.schedule(() => {
      this.cancelTimer = null;
      void this.flush({ keepalive: false });
    }, ms);
  }

  private clearTimer(): void {
    if (this.cancelTimer) {
      this.cancelTimer();
      this.cancelTimer = null;
    }
  }

  private collectSendable(): Map<string, LeafState> {
    const sendable = new Map<string, LeafState>();
    this.leaves.forEach((state, key) => {
      if (!state.dirty) return;
      // A permanently rejected generation is never auto-resent; a subsequent
      // user edit bumps the generation and clears the exclusion.
      if (state.rejectedGen === state.gen) return;
      // No-op suppression compares desired against confirmedWritten — but a
      // leaf under delivery uncertainty is never suppressed by equality with
      // the OLD baseline (the server may hold something else).
      if (!state.mustConfirm && leafEqual(key, state.desired, state.confirmedWritten)) {
        state.dirty = false;
        return;
      }
      sendable.set(key, state);
    });
    return sendable;
  }

  private journalEntriesFromDirty(): Record<string, ProfileJournalEntryV1> {
    const entries: Record<string, ProfileJournalEntryV1> = {};
    this.leaves.forEach((state, key) => {
      if (!state.dirty) return;
      entries[key] = {
        value: state.desired,
        gen: state.gen,
        mustConfirm: state.mustConfirm,
        editedAt: state.editedAt,
      };
    });
    return entries;
  }

  /** Persist the current unacknowledged desired state. Synchronous. */
  writeJournalNow(): void {
    this.deps.writeJournal(this.journalEntriesFromDirty());
  }

  async flush(opts: { keepalive: boolean }): Promise<void> {
    if (!this.enabled) return;
    if (this.inFlight) {
      this.flushRequested = true;
      return;
    }

    const sendable = this.collectSendable();
    if (sendable.size === 0) return;

    const sentGen = new Map<string, number>();
    const sentValue = new Map<string, unknown>();
    sendable.forEach((state, key) => {
      sentGen.set(key, state.gen);
      sentValue.set(key, state.desired);
      if (opts.keepalive) {
        // The response may never arrive; assume ambiguous delivery up front.
        state.mustConfirm = true;
      }
    });

    if (opts.keepalive) {
      // Persist the uncertainty synchronously BEFORE dispatching — the page
      // may be killed the instant this returns to the event loop.
      this.writeJournalNow();
    }

    const patch = buildPatchFromLeaves(sentValue);
    this.inFlight = true;

    let result: AutosaveSendResult;
    try {
      result = await this.deps.send(patch, { keepalive: opts.keepalive });
    } catch {
      result = { kind: "retryable" };
    }
    this.inFlight = false;

    if (result.kind === "ok") {
      const ackedJournalKeys: string[] = [];
      let needsFollowUp = false;
      sentGen.forEach((gen, key) => {
        const state = this.leaf(key);
        // ALWAYS advance the baseline to what the server now holds …
        state.confirmedWritten = sentValue.get(key);
        // … and let generation equality decide only whether dirty clears.
        if (state.gen === gen) {
          state.dirty = false;
          state.mustConfirm = false;
          state.rejectedGen = null;
          ackedJournalKeys.push(key);
        } else {
          needsFollowUp = true;
        }
      });
      if (ackedJournalKeys.length > 0) {
        this.writeJournalNow(); // Re-serialize without the acknowledged leaves.
      }
      this.backoffAttempt = 0;
      this.deps.onSuccess(result.response);
      if (this.flushRequested || needsFollowUp) {
        this.flushRequested = false;
        this.startTimer(this.debounceMs);
      }
      return;
    }

    if (result.kind === "identity_changed" || result.kind === "auth_failed") {
      // Either way this session can no longer save: journal the dirty values
      // under the current identity, halt, and let the provider force a reload
      // (Cloudflare Access re-establishes who is signed in).
      this.writeJournalNow();
      this.enabled = false;
      this.clearTimer();
      this.deps.onIdentityChanged();
      return;
    }

    if (result.kind === "rejected") {
      // The server refused the write outright (400/413) — it certainly did
      // not commit, so there is no delivery ambiguity, and resending the same
      // payload can never succeed. Freeze the rejected generations (the
      // user's in-memory view stays untouched; a later edit re-attempts) and
      // surface the quiet inline note instead of spinning in backoff.
      sentGen.forEach((gen, key) => {
        const state = this.leaf(key);
        if (state.gen === gen) {
          state.rejectedGen = gen;
          state.mustConfirm = false;
        }
        // A leaf edited during flight has a newer generation — it stays
        // sendable with its new value.
      });
      this.writeJournalNow();
      this.deps.onPermanentRejection?.();
      if (this.flushRequested || this.hasWork()) {
        this.flushRequested = false;
        this.startTimer(this.debounceMs);
      }
      return;
    }

    if (result.kind === "unsupported_version") {
      // Read-only newer-version document: autosave off for the session.
      this.enabled = false;
      this.clearTimer();
      return;
    }

    // Retryable failure: dispatched but unacknowledged — the server may have
    // committed it. Mark uncertainty, persist it, and retry with backoff even
    // if no further edit occurs. Retries rebuild from current desired.
    sentGen.forEach((_gen, key) => {
      this.leaf(key).mustConfirm = true;
    });
    this.writeJournalNow();
    this.backoffAttempt += 1;
    const delay = Math.min(this.backoffBaseMs * 2 ** (this.backoffAttempt - 1), this.backoffCapMs);
    this.startTimer(delay);
  }

  /**
   * Backgrounding (pagehide / visibility loss): journal synchronously FIRST —
   * the page may be killed at any instant — then a best-effort keepalive
   * flush, and never a concurrent request over an in-flight write.
   */
  handlePageHide(): void {
    if (!this.enabled) return;
    this.writeJournalNow();
    if (this.inFlight) return;
    this.clearTimer();
    void this.flush({ keepalive: true });
  }

  /** Journal + halt on an identity change detected outside a PUT (e.g. GET). */
  stopForIdentityChange(): void {
    this.writeJournalNow();
    this.enabled = false;
    this.clearTimer();
  }
}
