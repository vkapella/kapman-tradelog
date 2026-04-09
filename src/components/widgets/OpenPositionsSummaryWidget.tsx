"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { WidgetCard } from "@/components/widgets/WidgetCard";
import { formatCurrency } from "@/components/widgets/utils";
import { useAccountFilterContext } from "@/contexts/AccountFilterContext";
import { useOpenPositions } from "@/hooks/useOpenPositions";
import type { OptionQuoteResponse, QuotesResponse } from "@/types/api";

export function OpenPositionsSummaryWidget() {
  const { selectedAccounts } = useAccountFilterContext();
  const { positions } = useOpenPositions();
  const [markValue, setMarkValue] = useState<number | null>(null);
  const [lastQuoted, setLastQuoted] = useState<Date | null>(null);

  const filtered = useMemo(() => positions.filter((position) => selectedAccounts.includes(position.accountId)), [positions, selectedAccounts]);

  useEffect(() => {
    let cancelled = false;

    async function loadMarks() {
      if (filtered.length === 0) {
        if (!cancelled) {
          setMarkValue(0);
          setLastQuoted(null);
        }
        return;
      }

      let total = 0;

      const equities = filtered.filter((position) => position.assetClass === "EQUITY");
      const options = filtered.filter((position) => position.assetClass === "OPTION");

      if (equities.length > 0) {
        const symbols = Array.from(new Set(equities.map((position) => position.symbol))).join(",");
        const response = await fetch(`/api/quotes?symbols=${encodeURIComponent(symbols)}`, { cache: "no-store" });
        const payload = (await response.json()) as QuotesResponse;
        if ("error" in payload) {
          if (!cancelled) {
            setMarkValue(null);
            setLastQuoted(null);
          }
          return;
        }

        for (const position of equities) {
          const quote = payload[position.symbol];
          if (!quote) {
            continue;
          }
          total += quote.mark * position.netQty;
        }
      }

      if (options.length > 0) {
        for (const position of options) {
          const expDate = position.expirationDate?.slice(0, 10);
          if (!position.optionType || !position.strike || !expDate) {
            continue;
          }

          const response = await fetch(
            `/api/option-quote?symbol=${encodeURIComponent(position.underlyingSymbol)}&strike=${encodeURIComponent(
              position.strike,
            )}&expDate=${encodeURIComponent(expDate)}&contractType=${position.optionType}`,
            { cache: "no-store" },
          );
          const payload = (await response.json()) as OptionQuoteResponse;

          if ("error" in payload) {
            if (!cancelled) {
              setMarkValue(null);
              setLastQuoted(null);
            }
            return;
          }

          total += payload.mark * 100 * position.netQty;
        }
      }

      if (!cancelled) {
        setMarkValue(total);
        setLastQuoted(new Date());
      }
    }

    void loadMarks();

    return () => {
      cancelled = true;
    };
  }, [filtered]);

  const totalCostBasis = useMemo(() => filtered.reduce((sum, row) => sum + row.costBasis, 0), [filtered]);
  const unrealized = markValue === null ? null : markValue - totalCostBasis;

  return (
    <WidgetCard title="Open Positions Summary">
      <div className="space-y-1 text-xs text-muted">
        <p>Open positions: {filtered.length}</p>
        <p>Cost basis: {formatCurrency(totalCostBasis)}</p>
        <p>Mark value: {markValue === null ? "—" : formatCurrency(markValue)}</p>
        <p className={unrealized !== null && unrealized >= 0 ? "text-accent-2" : "text-red-300"}>
          Unrealized: {unrealized === null ? "—" : formatCurrency(unrealized)}
        </p>
        <p>Last quoted: {lastQuoted ? lastQuoted.toLocaleTimeString() : "—"}</p>
      </div>
      <Link href="/positions" className="mt-2 inline-block text-xs text-accent underline">
        View positions →
      </Link>
    </WidgetCard>
  );
}
