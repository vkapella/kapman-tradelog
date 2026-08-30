"use client";

import type { ReactElement, ReactNode, RefObject } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";

const VIRTUAL_GRID_PLAIN_ROW_LIMIT = 1000;
const VIRTUAL_GRID_FALLBACK_HEIGHT = 600;

export function shouldRenderPlainVirtualGridRows(rowCount: number, virtualItemCount: number): boolean {
  return rowCount > 0 && (rowCount <= VIRTUAL_GRID_PLAIN_ROW_LIMIT || virtualItemCount === 0);
}

interface VirtualGridTableShellProps {
  children: ReactNode;
  height?: number | string;
  scrollContainerRef: RefObject<HTMLDivElement>;
  /** Config-derived responsive templates (#340). When set, header/body rows
   *  consume var(--vgrid-cols), resolved per breakpoint by a global rule —
   *  no inline template on rows, no !important. */
  desktopTemplate?: string;
  mobileTemplate?: string;
}

export function VirtualGridTableShell({
  children,
  height,
  scrollContainerRef,
  desktopTemplate,
  mobileTemplate,
}: VirtualGridTableShellProps) {
  const templateVars = desktopTemplate
    ? ({
        "--vgrid-cols-desktop": desktopTemplate,
        ...(mobileTemplate ? { "--vgrid-cols-mobile": mobileTemplate } : {}),
      } as React.CSSProperties)
    : undefined;
  return (
    <div
      ref={scrollContainerRef}
      data-virtual-grid-shell=""
      style={{
        ...(height !== undefined ? { height } : {}),
        overflowY: "auto",
        overflowX: "auto",
        position: "relative",
        ...templateVars,
      }}
      className={["rounded border border-border", height === undefined ? "vgrid-default-height" : ""].join(" ")}
    >
      {children}
    </div>
  );
}

interface VirtualGridHeaderRowProps {
  children: ReactNode;
  /** Legacy inline template. Omit on config-migrated tables: rows then consume
   *  the shell's responsive var(--vgrid-cols). */
  columnTemplate?: string;
  className?: string;
}

export function VirtualGridHeaderRow({
  children,
  columnTemplate,
  className = "bg-surface-2 text-text-2",
}: VirtualGridHeaderRowProps) {
  return (
    <div
      className={["sticky top-0 z-10 grid min-w-max text-xs", className].join(" ")}
      data-virtual-grid-header=""
      style={{ gridTemplateColumns: columnTemplate ?? "var(--vgrid-cols)", position: "sticky", top: 0, zIndex: 2 }}
      role="row"
    >
      {children}
    </div>
  );
}

interface VirtualGridBodyProps<TRow> {
  columnTemplate?: string;
  estimateSize?: number;
  getRowKey?: (row: TRow, index: number) => string;
  overscan?: number;
  renderRow: (row: TRow, index: number) => ReactElement;
  rowClassName?: string;
  rows: TRow[];
  scrollContainerRef: RefObject<HTMLDivElement>;
  /** Pointer convenience only (#340): opens the row detail sheet below md.
   *  The Details button column is the accessible activation path; clicks on
   *  child interactive controls (links, buttons, inputs) are ignored so
   *  drill-throughs keep working. Rows keep row semantics — no role=button. */
  onRowClick?: (row: TRow) => void;
}

function shouldIgnoreRowClick(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest("a, button, input, select, [role=\"button\"]") !== null;
}

export function VirtualGridBody<TRow>({
  columnTemplate,
  estimateSize,
  getRowKey,
  overscan,
  renderRow,
  rowClassName = "border-t border-border text-text",
  rows,
  scrollContainerRef,
  onRowClick,
}: VirtualGridBodyProps<TRow>) {
  const handleRowClick = onRowClick
    ? (row: TRow) => (event: React.MouseEvent) => {
        if (shouldIgnoreRowClick(event.target)) {
          return;
        }
        if (!window.matchMedia("(max-width: 767px)").matches) {
          return;
        }
        onRowClick(row);
      }
    : undefined;
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollContainerRef.current,
    getItemKey: (index) => (getRowKey ? getRowKey(rows[index] as TRow, index) : index),
    estimateSize: () => estimateSize ?? 36,
    initialRect: { width: 0, height: VIRTUAL_GRID_FALLBACK_HEIGHT },
    overscan: overscan ?? 5,
    useAnimationFrameWithResizeObserver: true,
  });
  const virtualItems = virtualizer.getVirtualItems();

  if (shouldRenderPlainVirtualGridRows(rows.length, virtualItems.length)) {
    return (
      <div className="min-w-max text-xs">
        {rows.map((row, index) => (
          <div
            key={getRowKey ? getRowKey(row, index) : index}
            className={["grid w-full", rowClassName].join(" ")}
            data-virtual-grid-row=""
            role="row"
            onClick={handleRowClick ? handleRowClick(row) : undefined}
            style={{ gridTemplateColumns: columnTemplate ?? "var(--vgrid-cols)" }}
          >
            {renderRow(row, index)}
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="relative min-w-max text-xs" style={{ height: `${virtualizer.getTotalSize()}px` }}>
      {virtualItems.map((virtualItem) => {
        const row = rows[virtualItem.index];
        return (
          <div
            key={getRowKey ? getRowKey(row, virtualItem.index) : virtualItem.key}
            data-index={virtualItem.index}
            ref={virtualizer.measureElement}
            className={["absolute left-0 top-0 grid w-full", rowClassName].join(" ")}
            data-virtual-grid-row=""
            role="row"
            onClick={handleRowClick ? handleRowClick(row) : undefined}
            style={{
              gridTemplateColumns: columnTemplate ?? "var(--vgrid-cols)",
              transform: `translateY(${virtualItem.start}px)`,
            }}
          >
            {renderRow(row, virtualItem.index)}
          </div>
        );
      })}
    </div>
  );
}
