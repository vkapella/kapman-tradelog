import { DataPageLayout } from "@/components/data-page-layout";
import { ExecutionsTablePanel } from "@/components/executions-table-panel";
import { dataPageCopy } from "@/lib/ui/page-copy";

function ExecutionsPage() {
  const page = dataPageCopy.executions;
  return (
    <div className="space-y-6">
      <DataPageLayout title={page.title} subtitle={page.subtitle} nextAction={page.nextAction} />
      <ExecutionsTablePanel />
    </div>
  );
}

export default function Page() {
  return <ExecutionsPage />;
}
