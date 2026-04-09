import type { ReactNode } from "react";

interface WidgetCardProps {
  title: string;
  children: ReactNode;
  action?: ReactNode;
}

export function WidgetCard({ title, children, action }: WidgetCardProps) {
  return (
    <article className="h-full rounded-xl border border-border bg-panel p-4">
      <header className="mb-3 flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-text">{title}</h3>
        {action ?? null}
      </header>
      {children}
    </article>
  );
}
