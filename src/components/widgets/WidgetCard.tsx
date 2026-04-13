import type { ReactNode } from "react";
import { InfoTooltip, type InfoTooltipContent } from "@/components/widgets/InfoTooltip";
import { getWidgetHelpTextByTitle } from "@/lib/registries/widget-help";

interface WidgetCardProps {
  title: string;
  children: ReactNode;
  action?: ReactNode;
  helpText?: InfoTooltipContent;
}

export function WidgetCard({ title, children, action, helpText }: WidgetCardProps) {
  const resolvedHelpText = helpText ?? getWidgetHelpTextByTitle(title);

  return (
    <article className="h-full rounded-xl border border-border bg-panel p-4">
      <header className="mb-3 flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-text">{title}</h3>
        <div className="flex items-center gap-2">
          {resolvedHelpText ? <InfoTooltip label={title} content={resolvedHelpText} /> : null}
          {action ?? null}
        </div>
      </header>
      {children}
    </article>
  );
}
