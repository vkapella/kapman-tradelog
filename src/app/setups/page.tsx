import { DataPageLayout } from "@/components/data-page-layout";
import { SetupsAnalyticsPanel } from "@/components/setups-analytics-panel";
import { dataPageCopy } from "@/lib/ui/page-copy";

function SetupsPage() {
  const page = dataPageCopy.setups;
  return (
    <div className="space-y-6">
      <DataPageLayout title={page.title} subtitle={page.subtitle} nextAction={page.nextAction} />
      <SetupsAnalyticsPanel />
    </div>
  );
}

export default function Page() {
  return <SetupsPage />;
}
