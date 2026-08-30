"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { configCellClass, deriveDefinitions, type TableColumnConfig } from "@/components/data-table/column-config";
import { RowDetailSheet } from "@/components/data-table/RowDetailSheet";
import { latestPass1Summary } from "@/lib/recommendations/lineage-summary";
import type { RecommendationLineageSummaryRecord } from "@/types/api";

/**
 * The Today screen (go-live Increment 2, tradelog #329): pending HITL queue
 * cards with resolve actions, plus recent validated recommendations with
 * their plan-vs-actual verdicts. Resolving a card records a DECLARATION per
 * kapman-kb HITL_QUEUE_CONTRACT_v4.0 — an operator statement tied to the
 * reviewed proposal, never a confirmation: the next KB run re-fetches, runs
 * its own gates, and returns the proposal if it materially diverged.
 */

interface QueueItemView {
  queueItemId: string;
  ticker: string;
  lineageId: string;
  recId: string | null;
  asOf: string;
  createdAtSource: string;
  proposalSnapshot: {
    operator_prompt?: string;
    evaluation?: { flag_reasons?: string[]; gating_confidence?: number | null };
    decision_inputs?: Record<string, unknown>;
  };
  proposalHash: string;
  status: "PENDING" | "DECLARED" | "CONSUMED";
  effectiveDeclaration: {
    statement: string;
    statedAt: string;
    operatorNote: string | null;
    supersededCount: number;
  } | null;
  outcome: { resolution: string; resultingStatus: string; consumedAt: string } | null;
}

interface RecommendationRow {
  recId: string;
  ticker: string;
  structure: string | null;
  disposition: string;
  asOf: string;
  entryRangeLow: string | null;
  entryRangeHigh: string | null;
  chainQuality: string | null;
}

interface PlanVsActualRow {
  recId: string;
  taken: boolean;
  partialLegs: boolean;
  effectivePrice: number | null;
  fillVsRange: string | null;
  rangeDeviationPct: number | null;
}

const REGIMES = [
  "accumulation", "markup", "reaccumulation",
  "distribution", "markdown", "redistribution", "ranging_undefined",
] as const;

const STATEMENT_HELP: Record<string, string> = {
  ACCEPT: "Accept the proposed reading (as reviewed)",
  OVERRIDE: "State a different reading",
  ESTIMATE: "Send to the estimation path",
  DEFER: "Leave UNKNOWN",
};

function QueueCard({ item, onResolved }: { item: QueueItemView; onResolved: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [overrideOpen, setOverrideOpen] = useState(false);
  const [overrideRegime, setOverrideRegime] = useState<string>("accumulation");
  const [note, setNote] = useState("");

  const declare = useCallback(
    async (statement: string, overrideReading: { regime: string; phase: string | null } | null) => {
      setBusy(true);
      setError(null);
      try {
        const res = await fetch(`/api/queue/items/${encodeURIComponent(item.queueItemId)}/declarations`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            proposal_hash: item.proposalHash,
            statement,
            override_reading: overrideReading,
            operator_note: note.trim() === "" ? null : note.trim(),
          }),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => null);
          throw new Error(body?.error?.message ?? `HTTP ${res.status}`);
        }
        onResolved();
      } catch (e) {
        setError(String(e instanceof Error ? e.message : e));
      } finally {
        setBusy(false);
      }
    },
    [item.queueItemId, item.proposalHash, note, onResolved],
  );

  const reasons = item.proposalSnapshot.evaluation?.flag_reasons ?? [];

  return (
    <article className="rounded-xl border border-border bg-surface p-4">
      <div className="flex items-baseline justify-between gap-2">
        <p className="font-mono text-lg font-semibold text-text">{item.ticker}</p>
        <p className="text-[10px] uppercase tracking-[0.08em] text-text-2">
          {item.status === "PENDING" ? "awaiting your answer" : item.status.toLowerCase()}
        </p>
      </div>
      <p className="mt-1 text-[11px] text-text-2">
        {item.lineageId}
        {item.recId ? ` · ${item.recId}` : ""} · data as of {item.asOf}
      </p>
      {item.proposalSnapshot.operator_prompt ? (
        <p className="mt-2 whitespace-pre-wrap text-sm text-text">{item.proposalSnapshot.operator_prompt}</p>
      ) : null}
      {reasons.length > 0 ? (
        <ul className="mt-2 list-disc pl-5 text-xs text-text-2">
          {reasons.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
      ) : null}

      {item.status === "PENDING" || item.status === "DECLARED" ? (
        <div className="mt-3">
          {item.effectiveDeclaration ? (
            <p className="mb-2 text-xs text-accent">
              Declared {item.effectiveDeclaration.statement} at{" "}
              {new Date(item.effectiveDeclaration.statedAt).toLocaleString()} — awaiting a fresh run.
              A new answer below supersedes it.
            </p>
          ) : null}
          <input
            className="mb-2 w-full rounded-md border border-border bg-transparent px-2 py-1 text-xs text-text"
            placeholder="optional note (recorded verbatim)"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            disabled={busy}
          />
          <div className="flex flex-wrap items-center gap-2">
            {(["ACCEPT", "ESTIMATE", "DEFER"] as const).map((s) => (
              <button
                key={s}
                type="button"
                title={STATEMENT_HELP[s]}
                disabled={busy}
                onClick={() => declare(s, null)}
                className="rounded-md border border-border px-3 py-1 text-xs font-medium text-text hover:bg-surface-3 disabled:opacity-50"
              >
                {s}
              </button>
            ))}
            <button
              type="button"
              title={STATEMENT_HELP.OVERRIDE}
              disabled={busy}
              onClick={() => setOverrideOpen((v) => !v)}
              className="rounded-md border border-border px-3 py-1 text-xs font-medium text-accent hover:bg-surface-3 disabled:opacity-50"
            >
              OVERRIDE…
            </button>
            {overrideOpen ? (
              <span className="flex items-center gap-2">
                <select
                  className="rounded-md border border-border bg-surface-3 px-2 py-1 text-xs text-text"
                  value={overrideRegime}
                  onChange={(e) => setOverrideRegime(e.target.value)}
                  disabled={busy}
                >
                  {REGIMES.map((r) => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => declare("OVERRIDE", { regime: overrideRegime, phase: null })}
                  className="rounded-md border border-border px-3 py-1 text-xs font-medium text-accent hover:bg-surface-3 disabled:opacity-50"
                >
                  state it
                </button>
              </span>
            ) : null}
          </div>
          <p className="mt-2 text-[10px] text-text-2">
            Your answer travels as a declaration — the next run re-fetches and re-flags if the picture changed.
          </p>
        </div>
      ) : item.outcome ? (
        <p className="mt-3 text-xs text-text-2">
          Consumed {new Date(item.outcome.consumedAt).toLocaleString()} — {item.outcome.resolution} →{" "}
          {item.outcome.resultingStatus}
        </p>
      ) : null}
      {error ? <p className="mt-2 text-xs text-red-300">{error}</p> : null}
    </article>
  );
}

export default function TodayPage() {
  const [items, setItems] = useState<QueueItemView[] | null>(null);
  const [recs, setRecs] = useState<RecommendationRow[] | null>(null);
  const [pva, setPva] = useState<Map<string, PlanVsActualRow>>(new Map());
  const [latestScreen, setLatestScreen] = useState<RecommendationLineageSummaryRecord | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [itemsRes, recsRes, pvaRes, lineagesRes] = await Promise.all([
        fetch("/api/queue/items"),
        fetch("/api/recommendations?pass=PASS2&disposition=VALIDATED&pageSize=25"),
        fetch("/api/recommendations/plan-vs-actual"),
        fetch("/api/recommendations/lineages"),
      ]);
      if (!itemsRes.ok || !recsRes.ok || !pvaRes.ok) throw new Error("load failed");
      setItems((await itemsRes.json()).data);
      setRecs((await recsRes.json()).data);
      const pvaRows: PlanVsActualRow[] = (await pvaRes.json()).data;
      setPva(new Map(pvaRows.map((r) => [r.recId, r])));
      if (lineagesRes.ok) {
        const lineages: RecommendationLineageSummaryRecord[] = (await lineagesRes.json()).data;
        setLatestScreen(latestPass1Summary(lineages));
      }
      setLoadError(null);
    } catch (e) {
      setLoadError(String(e instanceof Error ? e.message : e));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const [recDetailRow, setRecDetailRow] = useState<RecommendationRow | null>(null);
  const recConfigs = useMemo<TableColumnConfig<RecommendationRow>[]>(() => {
    const taken = (rec: RecommendationRow) => {
      const verdict = pva.get(rec.recId);
      return verdict ? (verdict.taken ? "yes" : verdict.partialLegs ? "partial" : "no") : "—";
    };
    const fillVsRange = (rec: RecommendationRow) => {
      const verdict = pva.get(rec.recId);
      return verdict?.taken && verdict.fillVsRange
        ? verdict.fillVsRange === "INSIDE"
          ? "inside"
          : `${verdict.fillVsRange.toLowerCase()} ${verdict.rangeDeviationPct !== null ? `${verdict.rangeDeviationPct > 0 ? "+" : ""}${verdict.rangeDeviationPct}%` : ""}`
        : "—";
    };
    return [
      { definition: { id: "asOf", label: "As of" }, width: "auto", renderCell: (rec) => rec.asOf.slice(0, 10) },
      { definition: { id: "ticker", label: "Ticker" }, width: "auto", renderCell: (rec) => <span className="font-mono font-medium">{rec.ticker}</span> },
      { definition: { id: "structure", label: "Structure" }, width: "auto", renderCell: (rec) => rec.structure ?? "—" },
      {
        definition: { id: "entryRange", label: "Entry range" }, width: "auto", tier: 2,
        renderCell: (rec) => (
          <span className="font-mono">{rec.entryRangeLow !== null && rec.entryRangeHigh !== null ? `${rec.entryRangeLow}–${rec.entryRangeHigh}` : "—"}</span>
        ),
      },
      { definition: { id: "chain", label: "Chain" }, width: "auto", tier: 2, renderCell: (rec) => rec.chainQuality ?? "—" },
      { definition: { id: "taken", label: "Taken" }, width: "auto", renderCell: taken },
      { definition: { id: "fillVsRange", label: "Fill vs range" }, width: "auto", tier: 2, renderCell: (rec) => <span className="font-mono">{fillVsRange(rec)}</span> },
      {
        definition: { id: "__details", label: "Details" }, width: "auto", mobileOnly: true, includeInDetails: false,
        renderHeader: () => <span className="sr-only">Details</span>,
        renderCell: (rec) => (
          <button type="button" onClick={() => setRecDetailRow(rec)} aria-haspopup="dialog" aria-label="Recommendation details" className="touch-target rounded border border-border bg-surface-3 text-text-2">
            <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4 fill-none stroke-current" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 6l6 6-6 6" /></svg>
          </button>
        ),
      },
    ];
  }, [pva]);
  // Keeps the config invariant honest even without a data-table state here.
  void deriveDefinitions(recConfigs);

  const open = useMemo(() => (items ?? []).filter((i) => i.status !== "CONSUMED"), [items]);
  const consumed = useMemo(() => (items ?? []).filter((i) => i.status === "CONSUMED").slice(0, 10), [items]);

  return (
    <main className="mx-auto max-w-5xl space-y-8 p-4">
      <header>
        <h1 className="text-xl font-semibold text-text">Today</h1>
        <p className="mt-1 text-xs text-text-2">
          Flags awaiting your answer, and what the system proposed vs what actually filled. Answers are
          declarations, never confirmations — the fresh run always re-verifies.
        </p>
      </header>

      {loadError ? <p className="text-sm text-red-300">Failed to load: {loadError}</p> : null}

      <section>
        <h2 className="mb-2 text-[10px] uppercase tracking-[0.08em] text-text-2">
          Review queue {items ? `(${open.length} open)` : ""}
        </h2>
        {items === null ? (
          <p className="text-sm text-text-2">Loading…</p>
        ) : open.length === 0 ? (
          <p className="text-sm text-text-2">Nothing waiting on you.</p>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {open.map((item) => (
              <QueueCard key={item.queueItemId} item={item} onResolved={load} />
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-2 text-[10px] uppercase tracking-[0.08em] text-text-2">
          Recent Validated Recommendations (Pass 2)
        </h2>
        {latestScreen ? (
          <p className="mb-2 text-xs text-text-2">
            Latest screen:{" "}
            <Link
              href={`/recommendations?lineage=${encodeURIComponent(latestScreen.lineageId)}`}
              className="text-accent underline"
            >
              {latestScreen.lineageId} — {latestScreen.dispositions.ELIGIBLE ?? 0} eligible /{" "}
              {latestScreen.dispositions.WAIT ?? 0} wait →
            </Link>
          </p>
        ) : null}
        {recs === null ? (
          <p className="text-sm text-text-2">Loading…</p>
        ) : recs.length === 0 ? (
          <p className="text-sm text-text-2">No recommendations ingested yet.</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-border">
            {/* Config-migrated th/td generation (#340, approved Option A): Tier-1 =
                As-of, Ticker, Structure, Taken; remaining values via the shared
                detail sheet. Uses the shared config model without VirtualGrid. */}
            <table className="w-full text-left text-xs">
              <thead className="text-[10px] uppercase tracking-[0.08em] text-text-2">
                <tr>
                  {recConfigs.map((config) => (
                    <th key={config.definition.id} className={["px-3 py-2", configCellClass(config)].join(" ")}>
                      {config.renderHeader ? config.renderHeader() : config.definition.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="text-text">
                {recs.map((rec) => (
                  <tr key={rec.recId} className="border-t border-border">
                    {recConfigs.map((config) => (
                      <td key={config.definition.id} className={["px-3 py-2", configCellClass(config)].join(" ")}>
                        {config.renderCell(rec)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            <RowDetailSheet configs={recConfigs} row={recDetailRow} title="Recommendation details" onClose={() => setRecDetailRow(null)} />
          </div>
        )}
      </section>

      {consumed.length > 0 ? (
        <section>
          <h2 className="mb-2 text-[10px] uppercase tracking-[0.08em] text-text-2">Recently consumed</h2>
          <div className="grid gap-3 md:grid-cols-2">
            {consumed.map((item) => (
              <QueueCard key={item.queueItemId} item={item} onResolved={load} />
            ))}
          </div>
        </section>
      ) : null}
    </main>
  );
}
