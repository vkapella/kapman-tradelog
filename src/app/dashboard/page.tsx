"use client";

import { DndContext, type DragEndEvent, useDraggable, useDroppable } from "@dnd-kit/core";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import { handleRemoveWidgetClick, stopDashboardControlPropagation } from "./interactions";
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

function sanitizeStoredLayout(value: unknown, validIds: ReadonlySet<string>, fallback: string[]): string[] {
  if (!Array.isArray(value)) {
    return fallback;
  }

  const filtered = value.filter((item): item is string => typeof item === "string" && validIds.has(item));
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
  children,
}: {
  slotId: string;
  colSpan?: 1 | 2;
  editMode: boolean;
  remove: () => void;
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

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={[
        "relative",
        colSpan === 2 ? "md:col-span-2" : "",
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

  const [layout, setLayout] = useState<string[]>(DEFAULT_DASHBOARD_LAYOUT);
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
        setLayout(sanitizeStoredLayout(parsed, validWidgetIds, DEFAULT_DASHBOARD_LAYOUT));
      }
    } catch {
      setLayout(DEFAULT_DASHBOARD_LAYOUT);
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
          {layout.map((widgetId, index) => {
            const definition = widgetMap.get(widgetId);
            if (!definition) {
              return null;
            }

            const Component = definition.component;

            return (
              <DashboardTile
                key={widgetId + "-" + String(index)}
                slotId={`widget-slot-${String(index)}`}
                colSpan={definition.defaultColSpan}
                editMode={editMode}
                remove={() => setLayout((current) => current.filter((_value, valueIndex) => valueIndex !== index))}
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
        onSelect={(widgetId) => setLayout((current) => [...current, widgetId])}
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
