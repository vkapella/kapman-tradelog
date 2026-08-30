"use client";

import type { TableColumnConfig } from "@/components/data-table/column-config";

/**
 * The configured, mobile-only Details action column (#340): the accessible
 * activation path for the row detail sheet. A real button with native
 * Enter/Space, ≥44px effective target, excluded from its own sheet
 * (includeInDetails: false) and from the desktop template (mobileOnly).
 */
export function detailsColumnConfig<Row>(onOpen: (row: Row) => void): TableColumnConfig<Row> {
  return {
    definition: { id: "__details", label: "Details", alwaysVisible: true },
    width: "44px",
    mobileOnly: true,
    includeInDetails: false,
    renderHeader: () => <span className="sr-only">Details</span>,
    renderCell: (row) => (
      <span className="flex items-center justify-center">
        <button
          type="button"
          onClick={() => onOpen(row)}
          aria-haspopup="dialog"
          aria-label="Row details"
          className="touch-target rounded border border-border bg-surface-3 text-text-2"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4 fill-none stroke-current" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 6l6 6-6 6" />
          </svg>
        </button>
      </span>
    ),
  };
}
