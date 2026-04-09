import { DataPageLayout } from "@/components/data-page-layout";
import { dataPageCopy } from "@/lib/ui/page-copy";

function ExecutionsPage() {
  const page = dataPageCopy.executions;
  return <DataPageLayout title={page.title} subtitle={page.subtitle} nextAction={page.nextAction} />;
}

export default function Page() {
  return <ExecutionsPage />;
}
