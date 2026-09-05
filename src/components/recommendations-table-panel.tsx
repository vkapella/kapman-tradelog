"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import { Badge } from "@/components/Badge";
import { ColumnChooserControl } from "@/components/data-table/ColumnChooserControl";
import { DataTableToolbar } from "@/components/data-table/DataTableToolbar";
import { deriveDefinitions, type TableColumnConfig } from "@/components/data-table/column-config";
import { ConfigVirtualTable } from "@/components/data-table/ConfigVirtualTable";
import { detailsColumnConfig } from "@/components/data-table/details-column";
import { HiddenStateChips } from "@/components/data-table/HiddenStateChips";
import { RowDetailSheet } from "@/components/data-table/RowDetailSheet";
import { useDataTableState } from "@/components/data-table/useDataTableState";
import type { DataTableColumnDefinition, SortDirection } from "@/components/data-table/types";
import { LoadingSkeleton } from "@/components/loading-skeleton";
import { fetchAllPages } from "@/lib/api/fetch-all-pages";
import { formatDispositionBreakdown } from "@/lib/recommendations/lineage-summary";
import type {
  ApiListResponse,
  RecommendationLineageSummaryRecord,
  RecommendationRecord,
} from "@/types/api";

const OUTCOME_TOOLTIP =
  "Reserved for viewer forward-log outcomes, joined on rec ID / lineage / ticker / as-of / underlying ref. Not ingested yet.";

/** "150.000000" → "150", "12.500000" → "12.5"; null → em dash. */
export function formatDecimal(value: string | null): string {
  if (value === null || value.trim() === "") {
    return "—";
  }

  if (!value.includes(".")) {
    return value;
  }

  const trimmed = value.replace(/0+$/, "").replace(/\.$/, "");
  return trimmed === "" || trimmed === "-" ? "0" : trimmed;
}

export function formatEntryRange(row: Pick<RecommendationRecord, "entryRangeLow" | "entryRangeHigh" | "entryRangeRaw">): string {
  if (row.entryRangeLow !== null && row.entryRangeHigh !== null) {
    return `${formatDecimal(row.entryRangeLow)}–${formatDecimal(row.entryRangeHigh)}`;
  }

  return row.entryRangeRaw ?? "—";
}

export function formatStrikes(row: Pick<RecommendationRecord, "strike" | "strikeShort">): string {
  if (row.strike === null && row.strikeShort === null) {
    return "—";
  }

  if (row.strikeShort === null) {
    return formatDecimal(row.strike);
  }

  return `${formatDecimal(row.strike)} / ${formatDecimal(row.strikeShort)}`;
}

function dash(value: string | null | undefined): string {
  return value === null || value === undefined || value.trim() === "" ? "—" : value;
}

interface RecommendationColumnConfig {
  definition: DataTableColumnDefinition<RecommendationRecord>;
  width: string;
  mobileWidth?: string;
  /** Tier-1 (approved §0.4): As-of, Ticker, Disposition, Structure, Direction. */
  tier?: 1 | 2;
  render: (row: RecommendationRecord) => JSX.Element | string;
}

const COLUMN_CONFIGS: RecommendationColumnConfig[] = [
  {
    definition: {
      id: "asOf",
      label: "As-of",
      sortMode: "date",
      getSortValue: (row) => row.asOf,
      defaultSortDirection: "desc",
    },
    width: "96px",
    mobileWidth: "minmax(72px, auto)",
    render: (row) => row.asOf.slice(0, 10),
  },
  {
    definition: {
      id: "decidedAt",
      label: "Decided-at",
      sortMode: "date",
      getSortValue: (row) => row.decidedAt,
      defaultSortDirection: "desc",
    },
    width: "170px",
    tier: 2,
    render: (row) => (row.decidedAt ? new Date(row.decidedAt).toLocaleString() : "—"),
  },
  {
    definition: {
      id: "lineageId",
      label: "Lineage",
      sortMode: "string",
      getSortValue: (row) => row.lineageId,
    },
    width: "180px",
    tier: 2,
    render: (row) => <span className="font-mono">{row.lineageId}</span>,
  },
  {
    definition: {
      id: "scope",
      label: "Run / scope",
      sortMode: "string",
      getSortValue: (row) => row.runId ?? "",
    },
    width: "220px",
    tier: 2,
    // Entity + environment of the consuming run (#349); Legacy = produced
    // before runs carried scope, matched across every account.
    render: (row) =>
      row.runId === null ? (
        <span className="rounded border border-neg-border bg-neg-dim px-1 py-px text-[9px] uppercase tracking-wide text-neg">Legacy</span>
      ) : (
        <span className="flex items-center gap-1">
          <span className="font-mono">{row.runId}</span>
          {row.legalEntity ? <span className="text-[10px] text-text-2">{row.legalEntity.legalName}</span> : null}
          {row.environment === "PAPER" ? (
            <span className="rounded border border-warn-border bg-warn-dim px-1 py-px text-[9px] uppercase tracking-wide text-warn">Paper</span>
          ) : null}
        </span>
      ),
  },
  {
    definition: {
      id: "recId",
      label: "Rec ID",
      sortMode: "string",
      getSortValue: (row) => row.recId,
    },
    width: "220px",
    tier: 2,
    render: (row) => <span className="font-mono">{row.recId}</span>,
  },
  {
    definition: {
      id: "ticker",
      label: "Ticker",
      alwaysVisible: true,
      filterMode: "discrete",
      getFilterValues: (row) => row.ticker,
      sortMode: "string",
      getSortValue: (row) => row.ticker,
    },
    width: "84px",
    mobileWidth: "minmax(56px, auto)",
    render: (row) => <span className="font-mono font-medium">{row.ticker}</span>,
  },
  {
    definition: {
      id: "pass",
      label: "Pass",
      filterMode: "discrete",
      getFilterValues: (row) => row.pass,
      sortMode: "string",
      getSortValue: (row) => row.pass,
    },
    width: "78px",
    tier: 2,
    render: (row) => row.pass,
  },
  {
    definition: {
      id: "disposition",
      label: "Disposition",
      filterMode: "discrete",
      getFilterValues: (row) => row.disposition,
      sortMode: "string",
      getSortValue: (row) => row.disposition,
    },
    width: "110px",
    mobileWidth: "minmax(72px, auto)",
    render: (row) =>
      row.disposition === "ELIGIBLE" || row.disposition === "VALIDATED" ? (
        <Badge size={3} variant="buy">{row.disposition}</Badge>
      ) : row.disposition === "NO_TRADE" || row.disposition === "REJECTED" ? (
        <Badge size={3} variant="sell">{row.disposition === "NO_TRADE" ? "No trade" : row.disposition}</Badge>
      ) : (
        row.disposition
      ),
  },
  {
    definition: {
      id: "structure",
      label: "Structure",
      filterMode: "discrete",
      getFilterValues: (row) => row.structure,
      sortMode: "string",
      getSortValue: (row) => row.structure,
    },
    width: "150px",
    mobileWidth: "minmax(80px, auto)",
    render: (row) => dash(row.structure),
  },
  {
    definition: {
      id: "direction",
      label: "Direction",
      filterMode: "discrete",
      getFilterValues: (row) => row.direction,
      sortMode: "string",
      getSortValue: (row) => row.direction,
    },
    width: "96px",
    mobileWidth: "minmax(56px, auto)",
    render: (row) => dash(row.direction),
  },
  {
    definition: {
      id: "optionType",
      label: "Option type",
      filterMode: "discrete",
      getFilterValues: (row) => row.optionType,
      sortMode: "string",
      getSortValue: (row) => row.optionType,
    },
    width: "104px",
    tier: 2,
    render: (row) =>
      row.optionType ? <Badge size={2} variant={row.optionType === "PUT" ? "put" : "call"}>{row.optionType}</Badge> : "—",
  },
  {
    definition: {
      id: "sizingBand",
      label: "Sizing band",
      filterMode: "discrete",
      getFilterValues: (row) => row.sizingBand,
      sortMode: "string",
      getSortValue: (row) => row.sizingBand,
    },
    width: "104px",
    tier: 2,
    render: (row) => dash(row.sizingBand),
  },
  {
    definition: {
      id: "underlyingRef",
      label: "Underlying ref",
      align: "right",
      sortMode: "number",
      getSortValue: (row) => (row.underlyingRef === null ? null : Number(row.underlyingRef)),
    },
    width: "110px",
    tier: 2,
    render: (row) => <span className="font-mono">{formatDecimal(row.underlyingRef)}</span>,
  },
  {
    definition: {
      id: "strike",
      label: "Strike / Short",
      align: "right",
      title: "Strike, and short strike for two-leg structures",
      sortMode: "number",
      getSortValue: (row) => (row.strike === null ? null : Number(row.strike)),
    },
    width: "120px",
    tier: 2,
    render: (row) => <span className="font-mono">{formatStrikes(row)}</span>,
  },
  {
    definition: {
      id: "expirationDate",
      label: "Expiration",
      sortMode: "date",
      getSortValue: (row) => row.expirationDate,
    },
    width: "100px",
    tier: 2,
    render: (row) => (row.expirationDate ? row.expirationDate.slice(0, 10) : "—"),
  },
  {
    definition: {
      id: "entryRange",
      label: "Entry range",
      align: "right",
      sortMode: "number",
      getSortValue: (row) => (row.entryRangeLow === null ? null : Number(row.entryRangeLow)),
    },
    width: "120px",
    tier: 2,
    render: (row) => <span className="font-mono">{formatEntryRange(row)}</span>,
  },
  {
    definition: {
      id: "chainQuality",
      label: "Chain quality",
      filterMode: "discrete",
      getFilterValues: (row) => row.chainQuality,
      sortMode: "string",
      getSortValue: (row) => row.chainQuality,
    },
    width: "110px",
    tier: 2,
    render: (row) => dash(row.chainQuality),
  },
  {
    definition: {
      id: "reason",
      label: "Reason",
      sortMode: "string",
      getSortValue: (row) => row.reason,
    },
    width: "minmax(320px, 1fr)",
    tier: 2,
    render: (row) =>
      row.reason ? (
        <span className="block truncate" title={row.reason}>
          {row.reason}
        </span>
      ) : (
        "—"
      ),
  },
];

/**
 * Same badge vocabulary as the account selector (#335): entity name, Paper,
 * and — for rows produced before runs carried scope — Legacy (#349).
 */
function ScopeBadges({ summary }: { summary: Pick<RecommendationLineageSummaryRecord, "runId" | "legalEntity" | "environment"> }) {
  if (summary.runId === null) {
    return (
      <span className="rounded border border-neg-border bg-neg-dim px-1 py-px text-[9px] uppercase tracking-wide text-neg" title="LEGACY_UNSCOPED: produced before runs carried a legal entity and environment">
        Legacy
      </span>
    );
  }
  return (
    <>
      {summary.legalEntity ? (
        <span className="truncate text-[10px] text-text-2" title={summary.legalEntity.slug}>
          {summary.legalEntity.legalName}
        </span>
      ) : null}
      {summary.environment === "PAPER" ? (
        <span className="rounded border border-warn-border bg-warn-dim px-1 py-px text-[9px] uppercase tracking-wide text-warn">Paper</span>
      ) : null}
    </>
  );
}

function RunChip({
  active,
  onSelect,
  title,
  subtitle,
  badges,
}: {
  active: boolean;
  onSelect: () => void;
  title: string;
  subtitle: string | null;
  badges?: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={active}
      className={[
        "shrink-0 rounded-lg border px-3 py-2 text-left text-xs",
        active ? "border-accent bg-accent-dim text-text" : "border-border bg-surface-3 text-text-2 hover:text-text",
      ].join(" ")}
    >
      <span className="block font-medium">{title}</span>
      {subtitle ? <span className="mt-0.5 block font-mono text-[10px]">{subtitle}</span> : null}
      {badges ? <span className="mt-1 flex items-center gap-1">{badges}</span> : null}
    </button>
  );
}

export function RecommendationsTablePanel() {
  const searchParams = useSearchParams();

  const [summaries, setSummaries] = useState<RecommendationLineageSummaryRecord[] | null>(null);
  const [selectedLineage, setSelectedLineage] = useState<string | null>(null);
  const [lineageInitialized, setLineageInitialized] = useState(false);
  const [rows, setRows] = useState<RecommendationRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [openColumnId, setOpenColumnId] = useState<string | null>(null);

  // Honor a ?lineage= deep link (e.g. from the Today screen) exactly once,
  // then let the run selector own the selection.
  useEffect(() => {
    if (lineageInitialized) {
      return;
    }

    const lineageParam = searchParams.get("lineage");
    if (lineageParam) {
      setSelectedLineage(lineageParam);
    }
    setLineageInitialized(true);
  }, [lineageInitialized, searchParams]);

  useEffect(() => {
    let cancelled = false;

    async function loadSummaries() {
      try {
        const response = await fetch("/api/recommendations/lineages", { cache: "no-store" });
        if (!response.ok) {
          throw new Error("summary load failed");
        }
        const payload = (await response.json()) as ApiListResponse<RecommendationLineageSummaryRecord>;
        if (!cancelled) {
          setSummaries(payload.data);
        }
      } catch {
        if (!cancelled) {
          setSummaries([]);
        }
      }
    }

    void loadSummaries();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!lineageInitialized) {
      return;
    }

    let cancelled = false;

    async function loadRecommendations() {
      setLoading(true);
      setError(null);

      try {
        const query = new URLSearchParams();
        if (selectedLineage) {
          // The selector key is the run when the rows carry one (#349); a bare
          // lineage (legacy group, or a ?lineage= deep link) filters by lineage.
          const selectedSummary = summaries?.find((summary) => summary.groupKey === selectedLineage) ?? null;
          query.set(selectedSummary?.runId ? "runId" : "lineageId", selectedLineage);
        }
        const payload = await fetchAllPages<RecommendationRecord>("/api/recommendations", query);
        if (!cancelled) {
          setRows(payload.data);
        }
      } catch {
        if (!cancelled) {
          setError("Unable to load recommendations right now.");
          setRows([]);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadRecommendations();

    return () => {
      cancelled = true;
    };
  }, [lineageInitialized, selectedLineage, summaries]);

  const [detailRow, setDetailRow] = useState<RecommendationRecord | null>(null);
  // Every rendered track is config-derived (#340): the reserved "Outcome"
  // column (a future story fills it with viewer forward-log verdicts) and the
  // mobile Details action are real config entries, not template concatenation.
  const configs = useMemo<TableColumnConfig<RecommendationRecord>[]>(() => [
    ...COLUMN_CONFIGS.map((config): TableColumnConfig<RecommendationRecord> => ({
      definition: config.definition,
      width: config.width,
      mobileWidth: config.mobileWidth,
      tier: config.tier,
      stickyLeft: config.definition.id === "asOf",
      renderCell: (row) => (
        <div
          className={["px-2 py-2", config.definition.align === "right" ? "text-right" : "", config.definition.id === "reason" ? "min-w-0" : ""]
            .filter(Boolean)
            .join(" ")}
        >
          {config.render(row)}
        </div>
      ),
    })),
    {
      definition: { id: "outcome", label: "Outcome", alwaysVisible: true },
      width: "140px",
      tier: 2,
      renderHeader: () => (
        <span className="border-l border-dashed border-border pl-2 font-medium text-text-3" title={OUTCOME_TOOLTIP}>
          Outcome
        </span>
      ),
      renderCell: () => (
        <div className="border-l border-dashed border-border px-2 py-2 text-text-3" title={OUTCOME_TOOLTIP}>
          —
        </div>
      ),
    },
    detailsColumnConfig<RecommendationRecord>(setDetailRow),
  ], []);
  const columns = useMemo(() => deriveDefinitions(configs), [configs]);

  const table = useDataTableState({
    tableName: "recommendations",
    rows,
    columns,
    initialSort: { columnId: "asOf", direction: "desc" },
  });

  const totalRows = table.sortedRows.length;
  const hasRows = totalRows > 0;

  return (
    <section className="space-y-4 rounded-2xl border border-border bg-surface p-6 max-md:p-2">
      <header className="space-y-1">
        <h2 className="text-xl font-semibold text-text">Recommendations Explorer</h2>
        <p className="text-sm text-text-2">
          Every screening determination the Kapman pipeline mirrored here — Pass 1 and Pass 2, all dispositions.
          Read-only: corrections flow through the journal and re-ingest idempotently on rec ID.
        </p>
      </header>

      <div className="flex gap-2 overflow-x-auto pb-1">
        <RunChip
          active={selectedLineage === null}
          onSelect={() => setSelectedLineage(null)}
          title="All runs"
          subtitle={summaries ? `${summaries.reduce((sum, entry) => sum + entry.rowCount, 0)} rows` : null}
        />
        {(summaries ?? []).map((summary) => (
          <RunChip
            key={summary.groupKey}
            active={selectedLineage === summary.groupKey}
            onSelect={() => setSelectedLineage(summary.groupKey)}
            title={`${summary.asOf ? summary.asOf.slice(0, 10) : "—"} · ${summary.groupKey}`}
            subtitle={`${summary.rowCount} rows · ${formatDispositionBreakdown(summary.dispositions)}`}
            badges={<ScopeBadges summary={summary} />}
          />
        ))}
      </div>

      <DataTableToolbar
        activeFilterCount={table.activeFilterCount}
        onClearAllFilters={() => {
          table.clearAllFilters();
        }}
        totalRows={totalRows}
      >
        <ColumnChooserControl
          columns={columns}
          hiddenColumns={table.hiddenColumns}
          onSetColumnVisibility={table.setColumnVisibility}
          onResetColumnVisibility={table.resetColumnVisibility}
        />
      </DataTableToolbar>

      {loading ? <LoadingSkeleton lines={6} /> : null}
      {error ? <p className="text-sm text-neg">{error}</p> : null}

      {!loading && !error && totalRows === 0 ? (
        <div className="rounded-xl border border-border bg-bg p-6">
          <h3 className="text-lg font-medium text-text">No recommendations found</h3>
          <p className="mt-2 text-sm text-text-2">
            Adjust filters or pick a different run. Rows appear here when a Kapman screening run posts its
            determinations.
          </p>
        </div>
      ) : null}

      {!loading && !error && hasRows ? (
        <>
          <HiddenStateChips configs={configs} visibleColumns={table.visibleColumns} sort={table.sort} filters={table.filters} rangeFilters={table.rangeFilters} setSort={table.setSort} setColumnFilter={table.setColumnFilter} setColumnRange={table.setColumnRange} />
          <ConfigVirtualTable
            configs={configs}
            table={table}
            openColumnId={openColumnId}
            setOpenColumnId={setOpenColumnId}
            scrollContainerRef={scrollContainerRef}
            getRowKey={(row) => row.recId}
            onRowClick={setDetailRow}
          />
          <RowDetailSheet configs={configs} row={detailRow} title="Recommendation details" onClose={() => setDetailRow(null)} />
        </>
      ) : null}
    </section>
  );
}
