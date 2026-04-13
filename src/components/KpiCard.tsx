export type KpiCardColorVariant = "pos" | "neg" | "neutral" | "accent";

interface KpiCardProps {
  label: string;
  value: string | number;
  sub?: string;
  colorVariant?: KpiCardColorVariant;
}

const valueColorByVariant: Record<KpiCardColorVariant, string> = {
  pos: "text-accent-2",
  neg: "text-red-300",
  neutral: "text-text",
  accent: "text-accent",
};

export function KpiCard({ label, value, sub, colorVariant = "neutral" }: KpiCardProps) {
  return (
    <article className="rounded-xl border border-border bg-panel p-3">
      <p className="text-[10px] uppercase tracking-[0.08em] text-muted">{label}</p>
      <p className={`mt-1 font-mono text-2xl font-semibold ${valueColorByVariant[colorVariant]}`}>{value}</p>
      {sub ? <p className="mt-1 text-xs text-muted">{sub}</p> : null}
    </article>
  );
}
