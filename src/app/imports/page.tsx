import { DataPageLayout } from "@/components/data-page-layout";
import { AdapterRegistryPanel } from "@/components/adapter-registry-panel";
import { ImportsWorkflowPanel } from "@/components/imports-workflow-panel";
import { dataPageCopy } from "@/lib/ui/page-copy";

function ImportsConnectionsPage() {
  const page = dataPageCopy.imports;
  return (
    <div className="space-y-6">
      <DataPageLayout title={page.title} subtitle={page.subtitle} nextAction={page.nextAction} />
      <ImportsWorkflowPanel />
      <AdapterRegistryPanel />
    </div>
  );
}

export default function Page() {
  return <ImportsConnectionsPage />;
}
