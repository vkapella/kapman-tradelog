import type { ReactNode } from "react";

interface BadgeProps {
  variant: "buy" | "sell" | "call" | "put" | "win" | "loss" | "flat" | "to-open" | "to-close" | "committed" | "stub";
  children?: ReactNode;
}

const variantClasses: Record<BadgeProps["variant"], string> = {
  buy: "bg-green-500/20 text-green-200",
  sell: "bg-red-500/20 text-red-200",
  call: "bg-blue-500/20 text-blue-200",
  put: "bg-violet-500/20 text-violet-200",
  win: "bg-green-500/20 text-green-200",
  loss: "bg-red-500/20 text-red-200",
  flat: "bg-slate-500/20 text-slate-200",
  "to-open": "bg-blue-500/20 text-blue-200",
  "to-close": "bg-amber-500/20 text-amber-200",
  committed: "bg-green-500/20 text-green-200",
  stub: "bg-slate-500/20 text-slate-200",
};

export function Badge({ variant, children }: BadgeProps) {
  return (
    <span className={`inline-flex rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase leading-none ${variantClasses[variant]}`}>
      {children ?? variant.replace("-", " ")}
    </span>
  );
}
