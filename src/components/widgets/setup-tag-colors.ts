export type KnownSeriesTag = "long_call" | "stock" | "bull_vertical" | "diagonal" | "cash_secured_put";
export type SetupSeriesTag = KnownSeriesTag | "other";

export const tagColors: Record<KnownSeriesTag, string> = {
  long_call: "var(--accent)",
  stock: "var(--pos)",
  bull_vertical: "var(--warn)",
  diagonal: "var(--neg)",
  cash_secured_put: "var(--chart-purple)",
};

export const SETUP_TAG_FALLBACK_COLOR = "var(--text-2)";

export const CATEGORY_LEGEND: ReadonlyArray<{ key: SetupSeriesTag; label: string; color: string }> = [
  { key: "long_call", label: "long_call", color: tagColors.long_call },
  { key: "stock", label: "stock", color: tagColors.stock },
  { key: "bull_vertical", label: "bull_vertical", color: tagColors.bull_vertical },
  { key: "diagonal", label: "diagonal", color: tagColors.diagonal },
  { key: "cash_secured_put", label: "cash_secured_put", color: tagColors.cash_secured_put },
  { key: "other", label: "other", color: SETUP_TAG_FALLBACK_COLOR },
] as const;

const KNOWN_SERIES_TAGS: ReadonlySet<string> = new Set<string>([
  "long_call",
  "stock",
  "bull_vertical",
  "diagonal",
  "cash_secured_put",
]);

export function toSeriesTag(tag: string | null | undefined): SetupSeriesTag {
  return tag && KNOWN_SERIES_TAGS.has(tag) ? (tag as KnownSeriesTag) : "other";
}

export function getSeriesTagColor(tag: string): string {
  return tagColors[tag as KnownSeriesTag] ?? SETUP_TAG_FALLBACK_COLOR;
}
