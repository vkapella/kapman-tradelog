import type { ReactNode } from "react";

interface BadgeProps {
  variant: "buy" | "sell" | "call" | "put" | "win" | "loss" | "flat" | "to-open" | "to-close" | "committed" | "stub";
  children?: ReactNode;
}

interface BadgeStyle {
  background: string;
  color: string;
}

const defaultStyle: BadgeStyle = {
  background: "var(--surface-3)",
  color: "var(--text-2)",
};

const variantStyles: Partial<Record<BadgeProps["variant"], BadgeStyle>> = {
  buy: { background: "var(--accent-dim)", color: "var(--accent)" },
  sell: { background: "var(--neg-dim)", color: "var(--neg)" },
  win: { background: "var(--pos-dim)", color: "var(--pos)" },
  loss: { background: "var(--neg-dim)", color: "var(--neg)" },
  flat: defaultStyle,
  "to-open": { background: "var(--accent-dim)", color: "var(--accent)" },
  "to-close": defaultStyle,
  put: { background: "var(--warn-dim)", color: "var(--warn)" },
  call: { background: "var(--pos-dim)", color: "var(--pos)" },
};

export function Badge({ variant, children }: BadgeProps) {
  const style = variantStyles[variant] ?? defaultStyle;

  return (
    <span
      className="inline-flex px-1.5 py-0.5 text-[9px] font-bold uppercase leading-none"
      style={{
        background: style.background,
        border: "1px solid color-mix(in srgb, currentColor 25%, transparent)",
        borderRadius: "var(--r-sm)",
        color: style.color,
      }}
    >
      {children ?? variant.replace("-", " ")}
    </span>
  );
}
