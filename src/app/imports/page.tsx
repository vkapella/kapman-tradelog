import Link from "next/link";
import { AdapterRegistryPanel } from "@/components/adapter-registry-panel";
import { ImportsWorkflowPanel } from "@/components/imports-workflow-panel";

type ImportTab = "upload" | "history" | "adapters";

function normalizeTab(value: string | undefined): ImportTab {
  if (value === "history" || value === "adapters") {
    return value;
  }

  return "upload";
}

function TabLink({ tab, activeTab, label }: { tab: ImportTab; activeTab: ImportTab; label: string }) {
  const active = tab === activeTab;

  return (
    <Link
      href={"/imports?tab=" + tab}
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
        <TabLink tab="upload" activeTab={activeTab} label="Upload Statement" />
        <TabLink tab="history" activeTab={activeTab} label="Import History" />
        <TabLink tab="adapters" activeTab={activeTab} label="Adapter Registry" />
      </div>

      {activeTab === "upload" ? <ImportsWorkflowPanel mode="upload" /> : null}
      {activeTab === "history" ? <ImportsWorkflowPanel mode="history" /> : null}
      {activeTab === "adapters" ? <AdapterRegistryPanel /> : null}
    </section>
  );
}
