import { Suspense } from "react";
import { RecommendationsTablePanel } from "@/components/recommendations-table-panel";
import { LoadingSkeleton } from "@/components/loading-skeleton";

export default function Page() {
  return (
    <section className="space-y-4">
      <Suspense fallback={<LoadingSkeleton lines={6} />}>
        <RecommendationsTablePanel />
      </Suspense>
    </section>
  );
}
