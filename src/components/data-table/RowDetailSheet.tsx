"use client";

import { MobileSheet } from "@/components/overlay/MobileSheet";
import { detailConfigs, type TableColumnConfig } from "@/components/data-table/column-config";

interface RowDetailSheetProps<Row> {
  configs: TableColumnConfig<Row>[];
  row: Row | null;
  title: string;
  onClose: () => void;
}

/**
 * Complete-config row detail sheet (#340): lists EVERY column with
 * includeInDetails !== false as label/value from in-memory row data — Tier-2
 * and user-hidden columns stay reachable, and the Details action never renders
 * itself. No endpoints involved.
 */
export function RowDetailSheet<Row>({ configs, row, title, onClose }: RowDetailSheetProps<Row>) {
  return (
    <MobileSheet open={row !== null} onClose={onClose} title={title}>
      {row !== null ? (
        <dl className="divide-y divide-border">
          {detailConfigs(configs).map((config) => (
            <div key={config.definition.id} className="flex items-baseline justify-between gap-4 py-2">
              <dt className="shrink-0 text-[11px] uppercase tracking-wide text-text-2">{config.definition.label}</dt>
              <dd className="min-w-0 text-right text-xs text-text [overflow-wrap:anywhere]">
                {(config.renderDetailValue ?? config.renderCell)(row)}
              </dd>
            </div>
          ))}
        </dl>
      ) : null}
    </MobileSheet>
  );
}
