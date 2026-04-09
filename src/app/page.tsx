import { DataPageLayout } from "@/components/data-page-layout";
import { OverviewDashboardPanel } from "@/components/overview-dashboard-panel";
import { dataPageCopy } from "@/lib/ui/page-copy";

function OverviewPage() {
  const page = dataPageCopy.overview;
  return (
    <div className="space-y-6">
      <DataPageLayout title={page.title} subtitle={page.subtitle} nextAction={page.nextAction} />
      <OverviewDashboardPanel />
    </div>
  );
}

export default function Page() {
  return <OverviewPage />;
}
