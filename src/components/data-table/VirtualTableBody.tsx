"use client";

import type { ReactElement, RefObject } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";

interface VirtualTableBodyProps<TRow> {
  rows: TRow[];
  estimateSize?: number;
  overscan?: number;
  scrollContainerRef: RefObject<HTMLDivElement>;
  /**
   * Must return only the row cells (for example, a fragment of <td> elements).
   * Do not return a wrapping <tr>; VirtualTableBody owns the row element.
   */
  renderRow: (row: TRow, index: number) => ReactElement;
  getRowKey?: (row: TRow, index: number) => string;
  rowClassName?: string;
}

export function VirtualTableBody<TRow>({
  rows,
  estimateSize,
  overscan,
  scrollContainerRef,
  renderRow,
  getRowKey,
  rowClassName = "border-t border-border text-text",
}: VirtualTableBodyProps<TRow>) {
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollContainerRef.current,
    estimateSize: () => estimateSize ?? 36,
    overscan: overscan ?? 5,
  });

  return (
    <tbody style={{ height: `${virtualizer.getTotalSize()}px`, position: "relative" }}>
      {virtualizer.getVirtualItems().map((virtualItem) => {
        const row = rows[virtualItem.index];
        return (
          <tr
            key={getRowKey ? getRowKey(row, virtualItem.index) : virtualItem.key}
            data-index={virtualItem.index}
            ref={virtualizer.measureElement}
            className={rowClassName}
            style={{
              position: "absolute",
              top: 0,
              transform: `translateY(${virtualItem.start}px)`,
              width: "100%",
            }}
          >
            {renderRow(row, virtualItem.index)}
          </tr>
        );
      })}
    </tbody>
  );
}
