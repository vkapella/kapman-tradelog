import Link from "next/link";
import { ExecutionsTablePanel } from "@/components/executions-table-panel";
import { MatchedLotsTablePanel } from "@/components/matched-lots-table-panel";
import { SetupsAnalyticsPanel } from "@/components/setups-analytics-panel";

type TradeRecordTab = "executions" | "matched-lots" | "setups";

function normalizeTab(value: string | undefined): TradeRecordTab {
  if (value === "matched-lots" || value === "setups") {
    return value;
  }

  return "executions";
}

function TabLink({ tab, activeTab, label }: { tab: TradeRecordTab; activeTab: TradeRecordTab; label: string }) {
  const active = tab === activeTab;

  return (
    <Link
      href={"/trade-records?tab=" + tab}
      className={[
        "rounded-lg border px-3 py-1 text-xs font-medium",
        active ? "border-accent bg-accent/10 text-text" : "border-border bg-panel text-muted hover:text-text",
      ].join(" ")}
    >
      {label}
    </Link>
  );
}

export default function Page({ searchParams }: { searchParams?: Record<string, string | string[] | undefined> }) {
  const tabQuery = searchParams?.tab;
  const activeTab = normalizeTab(Array.isArray(tabQuery) ? tabQuery[0] : tabQuery);

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <TabLink tab="executions" activeTab={activeTab} label="Executions (T1)" />
        <TabLink tab="matched-lots" activeTab={activeTab} label="Matched Lots (T2)" />
        <TabLink tab="setups" activeTab={activeTab} label="Setups (T3)" />
      </div>

      {activeTab === "executions" ? <ExecutionsTablePanel /> : null}
      {activeTab === "matched-lots" ? <MatchedLotsTablePanel /> : null}
      {activeTab === "setups" ? <SetupsAnalyticsPanel /> : null}
    </section>
  );
}
