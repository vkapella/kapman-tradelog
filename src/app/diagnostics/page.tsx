import { DataPageLayout } from "@/components/data-page-layout";
import { DiagnosticsPanel } from "@/components/diagnostics-panel";
import { dataPageCopy } from "@/lib/ui/page-copy";

function DiagnosticsPage() {
  const page = dataPageCopy.diagnostics;
  return (
    <div className="space-y-6">
      <DataPageLayout title={page.title} subtitle={page.subtitle} nextAction={page.nextAction} />
      <DiagnosticsPanel />
    </div>
  );
}

export default function Page() {
  return <DiagnosticsPage />;
}
