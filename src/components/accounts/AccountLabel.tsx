"use client";

import { useAccountFilterContext } from "@/contexts/AccountFilterContext";

export function AccountLabel({ accountId, className = "", truncateInternalFallback = false }: { accountId: string; className?: string; truncateInternalFallback?: boolean }) {
  const { resolveAccountLabel } = useAccountFilterContext();
  const resolved = resolveAccountLabel(accountId);
  const text = resolved.isInternalFallback && truncateInternalFallback ? `${resolved.text.slice(0, 8)}...` : resolved.text;

  return (
    <span title={resolved.title} className={[resolved.useMonospace ? "font-mono" : "", className].filter(Boolean).join(" ")}>
      {text}
    </span>
  );
}
