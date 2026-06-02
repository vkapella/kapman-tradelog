import type { ReactNode } from "react";
import type { LegendProps } from "recharts";

export interface ChartLegendItem {
  key: string;
  label: string;
  color: string;
  marker?: "circle" | "line";
}

export interface ChartLegendInfoItem {
  label: string;
  color: string;
  marker?: "circle" | "line";
}

interface ChartToggleLegendProps extends LegendProps {
  hiddenItems: Set<string>;
  items: ReadonlyArray<ChartLegendItem>;
  onToggle: (key: string) => void;
  infoItems?: ReadonlyArray<ChartLegendInfoItem>;
  leadingContent?: ReactNode;
}

function LegendMarker({ color, marker = "circle" }: { color: string; marker?: "circle" | "line" }) {
  if (marker === "line") {
    return <span aria-hidden="true" className="h-0.5 w-4 rounded-full border border-border" style={{ backgroundColor: color }} />;
  }

  return <span aria-hidden="true" className="h-2.5 w-2.5 rounded-full border border-border" style={{ backgroundColor: color }} />;
}

export function ChartToggleLegend({ hiddenItems, items, onToggle, infoItems = [], leadingContent }: ChartToggleLegendProps) {
  return (
    <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-[10px] text-text-2">
      {leadingContent}
      {infoItems.map((item) => (
        <div key={item.label} className="flex items-center gap-2">
          <LegendMarker color={item.color} marker={item.marker} />
          <span>{item.label}</span>
        </div>
      ))}
      {items.map((item) => {
        const hidden = hiddenItems.has(item.key);
        return (
          <button
            key={item.key}
            type="button"
            onClick={() => onToggle(item.key)}
            className="flex items-center gap-2 transition-opacity"
            style={{ opacity: hidden ? 0.35 : 1 }}
            aria-pressed={!hidden}
          >
            <LegendMarker color={item.color} marker={item.marker} />
            <span>{item.label}</span>
          </button>
        );
      })}
    </div>
  );
}
