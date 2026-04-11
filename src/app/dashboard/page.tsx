"use client";

import { DndContext, type DragEndEvent, useDraggable, useDroppable } from "@dnd-kit/core";
import { useEffect, useMemo, useState } from "react";
import { WidgetPicker } from "@/components/WidgetPicker";
import { KpiCard } from "@/components/KpiCard";
import { LoadingSkeleton } from "@/components/loading-skeleton";
import { DEFAULT_DASHBOARD_LAYOUT, WIDGET_REGISTRY } from "@/lib/widget-registry";
import type { OverviewSummaryResponse } from "@/types/api";

const LAYOUT_STORAGE_KEY = "kapman_dashboard_layout";

interface OverviewPayload {
  data: OverviewSummaryResponse;
}

function sanitizeStoredLayout(value: unknown, validWidgetIds: ReadonlySet<string>): string[] {
  if (!Array.isArray(value)) {
    return DEFAULT_DASHBOARD_LAYOUT;
  }

  const filtered = value.filter((item): item is string => typeof item === "string" && validWidgetIds.has(item));
  return filtered.length > 0 ? filtered : DEFAULT_DASHBOARD_LAYOUT;
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
  colSpan: 1 | 2;
  editMode: boolean;
  remove: () => void;
  children: React.ReactNode;
}) {
  const { attributes, listeners, setNodeRef: setDragRef, transform, isDragging } = useDraggable({ id: slotId, disabled: !editMode });
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
        colSpan === 2 ? "md:col-span-2" : "md:col-span-1",
        editMode ? "cursor-move" : "",
      ].join(" ")}
      {...attributes}
      {...listeners}
    >
      {editMode ? (
        <button type="button" onClick={remove} className="absolute right-2 top-2 z-30 rounded border border-border bg-panel px-2 py-0.5 text-xs text-muted">
          ×
        </button>
      ) : null}
      {children}
    </div>
  );
}

export default function Page() {
  const widgetMap = useMemo(() => new Map(WIDGET_REGISTRY.map((widget) => [widget.id, widget])), []);
  const validWidgetIds = useMemo(() => new Set(WIDGET_REGISTRY.map((widget) => widget.id)), []);
  const [layout, setLayout] = useState<string[]>(DEFAULT_DASHBOARD_LAYOUT);
  const [layoutHydrated, setLayoutHydrated] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);

  const [summary, setSummary] = useState<OverviewSummaryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(LAYOUT_STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as unknown;
        setLayout(sanitizeStoredLayout(parsed, validWidgetIds));
      }
    } catch {
      setLayout(DEFAULT_DASHBOARD_LAYOUT);
    } finally {
      setLayoutHydrated(true);
    }
  }, [validWidgetIds]);

  useEffect(() => {
    if (!layoutHydrated) {
      return;
    }

    try {
      window.localStorage.setItem(LAYOUT_STORAGE_KEY, JSON.stringify(layout));
    } catch {
      // Ignore localStorage errors.
    }
  }, [layout, layoutHydrated]);

  useEffect(() => {
    let cancelled = false;

    async function loadSummary() {
      try {
        const response = await fetch("/api/overview/summary", { cache: "no-store" });
        if (!response.ok) {
          throw new Error("Unable to load dashboard summary.");
        }

        const payload = (await response.json()) as OverviewPayload;
        if (!cancelled) {
          setSummary(payload.data);
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
  }, []);

  function onDragEnd(event: DragEndEvent) {
    const activeIndex = Number(String(event.active.id).replace("slot-", ""));
    const overIndex = Number(String(event.over?.id ?? "").replace("slot-", ""));

    if (!Number.isFinite(activeIndex) || !Number.isFinite(overIndex) || activeIndex === overIndex) {
      return;
    }

    setLayout((current) => reorder(current, activeIndex, overIndex));
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
        <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
          <KpiCard label="Realized P&L" value={summary.netPnl} colorVariant={Number(summary.netPnl) < 0 ? "neg" : "pos"} />
          <KpiCard label="Executions" value={summary.executionCount} colorVariant="accent" />
          <KpiCard label="Matched Lots" value={summary.matchedLotCount} colorVariant="accent" />
          <KpiCard label="Setups" value={summary.setupCount} colorVariant="accent" />
          <KpiCard label="Average Hold Days" value={summary.averageHoldDays} colorVariant="accent" />
          <KpiCard label="Snapshots" value={summary.snapshotCount} colorVariant="neutral" />
        </div>
      ) : null}

      <DndContext onDragEnd={onDragEnd}>
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
                slotId={"slot-" + String(index)}
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
    </section>
  );
}
