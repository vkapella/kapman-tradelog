"use client";

import { DndContext, type DragEndEvent, useDraggable, useDroppable } from "@dnd-kit/core";
import { type PointerEvent as ReactPointerEvent, type ReactNode, useEffect, useMemo, useState } from "react";
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
import { DEFAULT_KPI_LAYOUT, KPI_REGISTRY } from "@/lib/registries/kpi-registry";
import { DEFAULT_DASHBOARD_LAYOUT, WIDGET_REGISTRY } from "@/lib/widget-registry";
import type { OverviewSummaryResponse } from "@/types/api";

const WIDGET_LAYOUT_STORAGE_KEY = "kapman_dashboard_layout";
const KPI_LAYOUT_STORAGE_KEY = "kapman_kpi_layout";

interface OverviewPayload {
  data: OverviewSummaryResponse;
}

interface DashboardWidgetLayoutItem {
  widgetId: string;
  colSpan: DashboardWidgetColSpan;
}

function sanitizeStoredLayout(value: unknown, validIds: ReadonlySet<string>, fallback: string[]): string[] {
  if (!Array.isArray(value)) {
    return fallback;
  }

  const filtered = value.filter((item): item is string => typeof item === "string" && validIds.has(item));
  return filtered.length > 0 ? filtered : fallback;
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

function sanitizeStoredWidgetLayout(value: unknown, validWidgetIds: ReadonlySet<string>): DashboardWidgetLayoutItem[] {
  const fallback = buildDefaultWidgetLayout();

  if (!Array.isArray(value)) {
    return fallback;
  }

  const filtered = value.flatMap((item) => {
    if (typeof item === "string") {
      if (!validWidgetIds.has(item)) {
        return [];
      }

      return [
        {
          widgetId: item,
          colSpan: clampColSpan(WIDGET_REGISTRY.find((widget) => widget.id === item)?.defaultColSpan ?? 1),
        },
      ];
    }

    if (!item || typeof item !== "object") {
      return [];
    }

    const candidate = item as { widgetId?: unknown; colSpan?: unknown };
    if (typeof candidate.widgetId !== "string" || !validWidgetIds.has(candidate.widgetId)) {
      return [];
    }

    return [
      {
        widgetId: candidate.widgetId,
        colSpan: clampColSpan(Number(candidate.colSpan ?? 1)),
      },
    ];
  });

  return filtered.length > 0 ? filtered : fallback;
}

function reorder<T>(items: T[], from: number, to: number): T[] {
  const next = [...items];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

function DashboardTile({
  slotId,
  colSpan,
  editMode,
  remove,
  onResize,
  children,
}: {
  slotId: string;
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

    const startX = event.clientX;
    const startSpan = colSpan;
    const resize = onResize;

    function handlePointerMove(moveEvent: PointerEvent) {
      resize(resolveWidgetColSpan(startSpan, moveEvent.clientX - startX));
    }

    function handlePointerUp() {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    }

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
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
            aria-label="Drag tile"
            className="absolute left-2 top-2 z-30 flex h-6 w-6 cursor-grab items-center justify-center rounded border border-border bg-panel text-[10px] text-muted hover:text-text active:cursor-grabbing"
            {...attributes}
            {...listeners}
          >
            ||
          </button>
          <button
            type="button"
            onPointerDown={stopDashboardControlPropagation}
            onClick={(event) => handleRemoveWidgetClick(event, { editMode, remove })}
            className="absolute right-2 top-2 z-30 rounded border border-border bg-panel px-2 py-0.5 text-xs text-muted"
          >
            ×
          </button>
          {onResize ? (
            <button
              type="button"
              aria-label="Resize widget"
              onPointerDown={handleResizePointerDown}
              className="absolute bottom-2 right-2 z-30 flex h-6 w-6 cursor-ew-resize items-center justify-center rounded border border-border bg-panel text-[10px] text-muted hover:text-text"
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
  const widgetMap = useMemo(() => new Map(WIDGET_REGISTRY.map((widget) => [widget.id, widget])), []);
  const validWidgetIds = useMemo(() => new Set(WIDGET_REGISTRY.map((widget) => widget.id)), []);
  const kpiMap = useMemo(() => new Map(KPI_REGISTRY.map((kpi) => [kpi.id, kpi])), []);
  const validKpiIds = useMemo(() => new Set(KPI_REGISTRY.map((kpi) => kpi.id)), []);

  const [layout, setLayout] = useState<DashboardWidgetLayoutItem[]>(buildDefaultWidgetLayout());
  const [layoutHydrated, setLayoutHydrated] = useState(false);
  const [kpiLayout, setKpiLayout] = useState<string[]>(DEFAULT_KPI_LAYOUT);
  const [kpiLayoutHydrated, setKpiLayoutHydrated] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [kpiPickerOpen, setKpiPickerOpen] = useState(false);

  const [summary, setSummary] = useState<OverviewSummaryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(WIDGET_LAYOUT_STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as unknown;
        setLayout(sanitizeStoredWidgetLayout(parsed, validWidgetIds));
      }
    } catch {
      setLayout(buildDefaultWidgetLayout());
    } finally {
      setLayoutHydrated(true);
    }
  }, [validWidgetIds]);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(KPI_LAYOUT_STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as unknown;
        setKpiLayout(sanitizeStoredLayout(parsed, validKpiIds, DEFAULT_KPI_LAYOUT));
      }
    } catch {
      setKpiLayout(DEFAULT_KPI_LAYOUT);
    } finally {
      setKpiLayoutHydrated(true);
    }
  }, [validKpiIds]);

  useEffect(() => {
    if (!layoutHydrated) {
      return;
    }

    try {
      window.localStorage.setItem(WIDGET_LAYOUT_STORAGE_KEY, JSON.stringify(layout));
    } catch {
      // Ignore localStorage errors.
    }
  }, [layout, layoutHydrated]);

  useEffect(() => {
    if (!kpiLayoutHydrated) {
      return;
    }

    try {
      window.localStorage.setItem(KPI_LAYOUT_STORAGE_KEY, JSON.stringify(kpiLayout));
    } catch {
      // Ignore localStorage errors.
    }
  }, [kpiLayout, kpiLayoutHydrated]);

  useEffect(() => {
    let cancelled = false;

    async function loadSummary() {
      try {
        const params = new URLSearchParams();
        if (selectedAccounts.length > 0) {
          params.set("accountIds", selectedAccounts.join(","));
        }
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
  }, [selectedAccounts]);

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
        {editMode ? (
          <button type="button" onClick={() => setEditMode(false)} className="rounded border border-border bg-panel-2 px-3 py-1 text-xs text-text">
            Done
          </button>
        ) : (
          <button type="button" onClick={() => setEditMode(true)} className="rounded border border-border bg-panel-2 px-3 py-1 text-xs text-text">
            Customize
          </button>
        )}
      </div>

      {loading ? <LoadingSkeleton lines={4} /> : null}
      {!loading && error ? <p className="text-sm text-red-200">{error}</p> : null}

      {!loading && !error && summary ? (
        <DndContext onDragEnd={onKpiDragEnd}>
          <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
            {kpiLayout.map((kpiId, index) => {
              const definition = kpiMap.get(kpiId);
              if (!definition) {
                return null;
              }

              return (
                <DashboardTile
                  key={kpiId + "-" + String(index)}
                  slotId={`kpi-slot-${String(index)}`}
                  editMode={editMode}
                  remove={() => setKpiLayout((current) => current.filter((_value, valueIndex) => valueIndex !== index))}
                >
                  <KpiCard
                    label={definition.name}
                    value={definition.formatValue(summary)}
                    colorVariant={definition.getColorVariant(summary)}
                    helpText={definition.helpText}
                  />
                </DashboardTile>
              );
            })}

            {editMode ? (
              <button
                type="button"
                onClick={() => setKpiPickerOpen(true)}
                className="rounded-xl border border-dashed border-border bg-panel-2 p-6 text-left text-sm text-muted"
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
              className="rounded-xl border border-dashed border-border bg-panel-2 p-6 text-left text-sm text-muted"
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
