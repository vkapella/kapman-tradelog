"use client";

import type { ReactNode, RefObject } from "react";

interface ScrollableTableShellProps {
  height?: number | string;
  children: ReactNode;
  scrollContainerRef: RefObject<HTMLDivElement>;
}

export function ScrollableTableShell({
  height,
  children,
  scrollContainerRef,
}: ScrollableTableShellProps) {
  return (
    <div
      ref={scrollContainerRef}
      style={{
        height: height ?? "calc(100vh - 280px)",
        overflowY: "auto",
        overflowX: "auto",
        position: "relative",
      }}
      className="rounded border border-border"
    >
      {children}
    </div>
  );
}
