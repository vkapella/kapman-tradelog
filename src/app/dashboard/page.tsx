"use client";

import { DndContext, type DragEndEvent, useDraggable, useDroppable } from "@dnd-kit/core";
import { type PointerEvent as ReactPointerEvent, type ReactNode, useContext, useEffect, useMemo, useRef, useState } from "react";
import {
  type DashboardWidgetColSpan,
  handleRemoveWidgetClick,
  resolveWidgetColSpan,
  stopDashboardControlPropagation,
} from "./interactions";
import { WidgetPicker } from "@/components/WidgetPicker";
import { KpiCard } from "@/components/KpiCard";
import { LoadingSkeleton } from "@/components/loading-skeleton";
import { KpiPicker } from "@/components/widgets/KpiPicker";
import { useAccountFilterContext } from "@/contexts/AccountFilterContext";
import { useProfileContext } from "@/contexts/ProfileContext";
import { RangeFilterContext } from "@/contexts/RangeFilterContext";
import { applyAccountIdsToSearchParams } from "@/lib/api/account-scope";
import { DEFAULT_KPI_LAYOUT, KPI_REGISTRY } from "@/lib/registries/kpi-registry";
import { DEFAULT_DASHBOARD_LAYOUT, WIDGET_REGISTRY } from "@/lib/widget-registry";
import type { OverviewSummaryResponse, ProfileWidgetItem } from "@/types/api";

interface OverviewPayload {
  data: OverviewSummaryResponse;
}

interface DashboardWidgetLayoutItem {
  widgetId: string;
  colSpan: DashboardWidgetColSpan;
}

// Display-only sanitization of profile layouts (#344): null = the app's
// built-in layout; a genuinely stored [] = the user intentionally removed
// everything and must round-trip as empty; invalid input (or a non-empty list
// whose entries are all unknown ids) falls back to the built-ins. The
// sanitized result is never written back to the profile.
function sanitizeProfileKpiLayout(value: string[] | null, validIds: ReadonlySet<string>): string[] {
  if (value === null) {
    return [...DEFAULT_KPI_LAYOUT];
  }
  if (value.length === 0) {
    return [];
  }

  const filtered = value.filter((id) => validIds.has(id));
  return filtered.length > 0 ? filtered : [...DEFAULT_KPI_LAYOUT];
}

function clampColSpan(value: number): DashboardWidgetColSpan {
  if (value <= 1) {
    return 1;
  }

  if (value >= 3) {
    return 3;
  }

  return value as DashboardWidgetColSpan;
}

function buildDefaultWidgetLayout(): DashboardWidgetLayoutItem[] {
  return DEFAULT_DASHBOARD_LAYOUT.map((widgetId) => ({
    widgetId,
    colSpan: clampColSpan(WIDGET_REGISTRY.find((widget) => widget.id === widgetId)?.defaultColSpan ?? 1),
  }));
}

function sanitizeProfileWidgetLayout(
  value: ProfileWidgetItem[] | null,
  validWidgetIds: ReadonlySet<string>,
): DashboardWidgetLayoutItem[] {
  if (value === null) {
    return buildDefaultWidgetLayout();
  }
  if (value.length === 0) {
    return [];
  }

  const filtered = value
    .filter((item) => validWidgetIds.has(item.widgetId))
    .map((item) => ({ widgetId: item.widgetId, colSpan: clampColSpan(item.colSpan) }));
  return filtered.length > 0 ? filtered : buildDefaultWidgetLayout();
}

function reorder<T>(items: T[], from: number, to: number): T[] {
  const next = [...items];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

function DashboardTile({
  slotId,
  widgetName,
  colSpan,
  editMode,
  remove,
  onResize,
  children,
}: {
  slotId: string;
  widgetName: string;
  colSpan?: DashboardWidgetColSpan;
  editMode: boolean;
  remove: () => void;
  onResize?: (nextSpan: DashboardWidgetColSpan) => void;
  children: ReactNode;
}) {
  const { attributes, listeners, setNodeRef: setDragRef, setActivatorNodeRef, transform, isDragging } = useDraggable({
    id: slotId,
    disabled: !editMode,
  });
  const { setNodeRef: setDropRef } = useDroppable({ id: slotId });

  const style = transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`, zIndex: isDragging ? 20 : 1 } : undefined;

  function setNodeRef(node: HTMLElement | null) {
    setDragRef(node);
    setDropRef(node);
  }

  function handleResizePointerDown(event: ReactPointerEvent<HTMLButtonElement>) {
    if (!onResize || !colSpan) {
      return;
    }

    stopDashboardControlPropagation(event);
    event.preventDefault();

    const startX = event.clientX;
    const startSpan = colSpan;
    const resize = onResize;
    const handle = event.currentTarget;
    const pointerId = event.pointerId;

    handle.setPointerCapture(pointerId);
    document.body.style.userSelect = "none";

    function handlePointerMove(moveEvent: PointerEvent) {
      moveEvent.preventDefault();
      resize(resolveWidgetColSpan(startSpan, moveEvent.clientX - startX));
    }

    function handlePointerUp() {
      if (handle.hasPointerCapture(pointerId)) {
        handle.releasePointerCapture(pointerId);
      }

      document.body.style.userSelect = "";
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerUp);
    }

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", handlePointerUp);
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={[
        "relative",
        colSpan === 3 ? "md:col-span-3" : colSpan === 2 ? "md:col-span-2" : "",
      ].join(" ")}
    >
      {editMode ? (
        <>
          <button
            ref={setActivatorNodeRef}
            type="button"
            aria-label={`Drag ${widgetName}`}
            className="absolute left-2 top-2 z-[var(--z-page-controls)] flex h-6 w-6 cursor-grab items-center justify-center rounded border border-border bg-surface-3 text-[10px] text-text-2 hover:text-text active:cursor-grabbing"
            {...attributes}
            {...listeners}
          >
            ||
          </button>
          <button
            type="button"
            onPointerDown={stopDashboardControlPropagation}
            onClick={(event) => handleRemoveWidgetClick(event, { editMode, remove })}
            aria-label={`Remove ${widgetName}`}
            className="absolute right-2 top-2 z-[var(--z-page-controls)] rounded border border-border bg-surface-3 px-2 py-0.5 text-xs text-text-2"
          >
            ×
          </button>
          {onResize ? (
            <button
              type="button"
              aria-label={`Resize ${widgetName}`}
              onPointerDown={handleResizePointerDown}
              className="absolute bottom-2 right-2 z-[var(--z-page-controls)] flex h-6 w-6 touch-none cursor-ew-resize select-none items-center justify-center rounded border border-border bg-surface-3 text-[10px] text-text-2 hover:text-text"
            >
              <>
                <span className="sr-only">Resize</span>
                <svg viewBox="0 0 24 24" aria-hidden="true" className="h-3.5 w-3.5 fill-current">
                  <path d="M7 17h2v-2H7v2zm4 0h2v-4h-2v4zm4 0h2V9h-2v8z" />
                </svg>
              </>
            </button>
          ) : null}
        </>
      ) : null}
      {children}
    </div>
  );
}

export default function Page() {
  const { selectedAccounts } = useAccountFilterContext();
  const { range, applyRangeToSearchParams } = useContext(RangeFilterContext);
  const profile = useProfileContext();
  const widgetMap = useMemo(() => new Map(WIDGET_REGISTRY.map((widget) => [widget.id, widget])), []);
  const validWidgetIds = useMemo(() => new Set(WIDGET_REGISTRY.map((widget) => widget.id)), []);
  const kpiMap = useMemo(() => new Map(KPI_REGISTRY.map((kpi) => [kpi.id, kpi])), []);
  const validKpiIds = useMemo(() => new Set(KPI_REGISTRY.map((kpi) => kpi.id)), []);

  // Layouts are owned by the profile (#344): seeded from it here (the
  // hydration barrier guarantees it resolved before this page mounts), edits
  // report upward through the auto-save pipeline, and hydrationGeneration
  // bumps (initial load, reset) re-seed WITHOUT reporting — hydrated state
  // must never mark a profile leaf dirty.
  const [layout, setLayout] = useState<DashboardWidgetLayoutItem[]>(() =>
    sanitizeProfileWidgetLayout(profile.widgets, validWidgetIds),
  );
  const [kpiLayout, setKpiLayout] = useState<string[]>(() => sanitizeProfileKpiLayout(profile.kpis, validKpiIds));
  const [editMode, setEditMode] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [kpiPickerOpen, setKpiPickerOpen] = useState(false);

  const [summary, setSummary] = useState<OverviewSummaryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const skipLayoutReportRef = useRef(true);
  const skipKpiReportRef = useRef(true);

  const { widgets: profileWidgets, kpis: profileKpis, hydrationGeneration, reportWidgets, reportKpis } = profile;

  useEffect(() => {
    skipLayoutReportRef.current = true;
    skipKpiReportRef.current = true;
    setLayout(sanitizeProfileWidgetLayout(profileWidgets, validWidgetIds));
    setKpiLayout(sanitizeProfileKpiLayout(profileKpis, validKpiIds));
    // Re-seed only on hydration/reset — profileWidgets/profileKpis otherwise
    // just echo this page's own reports.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrationGeneration, validWidgetIds, validKpiIds]);

  useEffect(() => {
    if (skipLayoutReportRef.current) {
      skipLayoutReportRef.current = false;
      return;
    }
    reportWidgets(layout);
  }, [layout, reportWidgets]);

  useEffect(() => {
    if (skipKpiReportRef.current) {
      skipKpiReportRef.current = false;
      return;
    }
    reportKpis(kpiLayout);
  }, [kpiLayout, reportKpis]);

  useEffect(() => {
    let cancelled = false;

    async function loadSummary() {
      try {
        const params = new URLSearchParams();
        applyAccountIdsToSearchParams(params, selectedAccounts);
        applyRangeToSearchParams(params);
        const response = await fetch(`/api/overview/summary?${params.toString()}`, { cache: "no-store" });
        if (!response.ok) {
          throw new Error("Unable to load dashboard summary.");
        }

        const payload = (await response.json()) as OverviewPayload;
        if (!cancelled) {
          setSummary(payload.data);
          setError(null);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "Dashboard load failed.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadSummary();

    return () => {
      cancelled = true;
    };
  }, [selectedAccounts, range.startDate, range.endDate, applyRangeToSearchParams]);

  const availableKpis = useMemo(() => {
    return KPI_REGISTRY.filter((kpi) => !kpiLayout.includes(kpi.id));
  }, [kpiLayout]);

  function onWidgetDragEnd(event: DragEndEvent) {
    const activeIndex = Number(String(event.active.id).replace("widget-slot-", ""));
    const overIndex = Number(String(event.over?.id ?? "").replace("widget-slot-", ""));

    if (!Number.isFinite(activeIndex) || !Number.isFinite(overIndex) || activeIndex === overIndex) {
      return;
    }

    setLayout((current) => reorder(current, activeIndex, overIndex));
  }

  function onKpiDragEnd(event: DragEndEvent) {
    const activeIndex = Number(String(event.active.id).replace("kpi-slot-", ""));
    const overIndex = Number(String(event.over?.id ?? "").replace("kpi-slot-", ""));

    if (!Number.isFinite(activeIndex) || !Number.isFinite(overIndex) || activeIndex === overIndex) {
      return;
    }

    setKpiLayout((current) => reorder(current, activeIndex, overIndex));
  }

  return (
    <section className="space-y-5">
      <div className="flex items-center justify-end gap-2">
        {profile.saveRejected ? (
          <span className="text-xs text-text-2">Some view changes couldn&apos;t be saved.</span>
        ) : null}
        {editMode ? (
          <>
            <button
              type="button"
              onClick={() => profile.resetToDefaults()}
              className="rounded border border-border bg-surface-3 px-3 py-1 text-xs text-text-2 touch-target"
            >
              Reset view to app defaults
            </button>
            <button type="button" onClick={() => setEditMode(false)} className="rounded border border-border bg-surface-3 px-3 py-1 text-xs text-text">
              Done
            </button>
          </>
        ) : (
          <button type="button" onClick={() => setEditMode(true)} className="rounded border border-border bg-surface-3 px-3 py-1 text-xs text-text touch-target">
            Customize
          </button>
        )}
      </div>

      {loading ? <LoadingSkeleton lines={4} /> : null}
      {!loading && error ? <p className="text-sm text-red-200">{error}</p> : null}

      {!loading && !error && summary ? (
        <DndContext onDragEnd={onKpiDragEnd}>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
            {kpiLayout.map((kpiId, index) => {
              const definition = kpiMap.get(kpiId);
              if (!definition) {
                return null;
              }

              return (
                <DashboardTile
                  key={kpiId + "-" + String(index)}
                  slotId={`kpi-slot-${String(index)}`}
                  widgetName={definition.name}
                  editMode={editMode}
                  remove={() => setKpiLayout((current) => current.filter((_value, valueIndex) => valueIndex !== index))}
                >
                  <KpiCard
                    label={definition.name}
                    value={definition.formatValue(summary)}
                    colorVariant={definition.getColorVariant(summary)}
                    helpText={definition.getHelpText ? definition.getHelpText(summary) : definition.helpText}
                  />
                </DashboardTile>
              );
            })}

            {editMode ? (
              <button
                type="button"
                onClick={() => setKpiPickerOpen(true)}
                className="rounded-xl border border-dashed border-border bg-surface p-6 text-left text-sm text-text-2"
              >
                + Add KPI
              </button>
            ) : null}
          </div>
        </DndContext>
      ) : null}

      <DndContext onDragEnd={onWidgetDragEnd}>
        <div className="grid gap-3 md:grid-cols-3">
          {layout.map((entry, index) => {
            const definition = widgetMap.get(entry.widgetId);
            if (!definition) {
              return null;
            }

            const Component = definition.component;

            return (
              <DashboardTile
                key={entry.widgetId + "-" + String(index)}
                slotId={`widget-slot-${String(index)}`}
                widgetName={definition.name}
                colSpan={entry.colSpan}
                editMode={editMode}
                remove={() => setLayout((current) => current.filter((_value, valueIndex) => valueIndex !== index))}
                onResize={(nextSpan) => {
                  setLayout((current) =>
                    current.map((item, itemIndex) => (itemIndex === index ? { ...item, colSpan: nextSpan } : item)),
                  );
                }}
              >
                <Component />
              </DashboardTile>
            );
          })}

          {editMode ? (
            <button
              type="button"
              onClick={() => setPickerOpen(true)}
              className="rounded-xl border border-dashed border-border bg-surface p-6 text-left text-sm text-text-2"
            >
              + Add widget
            </button>
          ) : null}
        </div>
      </DndContext>

      <WidgetPicker
        open={pickerOpen}
        widgets={WIDGET_REGISTRY}
        onClose={() => setPickerOpen(false)}
        onSelect={(widgetId) => {
          const definition = widgetMap.get(widgetId);
          setLayout((current) => [
            ...current,
            {
              widgetId,
              colSpan: clampColSpan(definition?.defaultColSpan ?? 1),
            },
          ]);
        }}
      />

      <KpiPicker
        open={kpiPickerOpen}
        kpis={availableKpis}
        onClose={() => setKpiPickerOpen(false)}
        onSelect={(kpiId) => {
          setKpiLayout((current) => (current.includes(kpiId) ? current : [...current, kpiId]));
        }}
      />
    </section>
  );
}
