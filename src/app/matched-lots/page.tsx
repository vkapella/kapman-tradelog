import { DataPageLayout } from "@/components/data-page-layout";
import { MatchedLotsTablePanel } from "@/components/matched-lots-table-panel";
import { dataPageCopy } from "@/lib/ui/page-copy";

function MatchedLotsPage() {
  const page = dataPageCopy.matchedLots;
  return (
    <div className="space-y-6">
      <DataPageLayout title={page.title} subtitle={page.subtitle} nextAction={page.nextAction} />
      <MatchedLotsTablePanel />
    </div>
  );
}

export default function Page() {
  return <MatchedLotsPage />;
}
