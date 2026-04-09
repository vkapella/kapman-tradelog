import { DataPageLayout } from "@/components/data-page-layout";
import { dataPageCopy } from "@/lib/ui/page-copy";

function DiagnosticsPage() {
  const page = dataPageCopy.diagnostics;
  return <DataPageLayout title={page.title} subtitle={page.subtitle} nextAction={page.nextAction} />;
}

export default function Page() {
  return <DiagnosticsPage />;
}
