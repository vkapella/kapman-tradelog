import { listResponse, parsePagination } from "@/lib/api/responses";
import { PrismaPipelineRunStore } from "@/lib/marketdata/pipeline-run-store";
import { MARKET_DATA_PIPELINE_JOB_NAME } from "@/lib/marketdata/scheduled-pipeline-store";
import { toSchedulerRunRecord } from "@/lib/marketdata/scheduler-status";

const MAX_PAGE_SIZE = 100;

export async function GET(request: Request) {
  const url = new URL(request.url);
  const { page, pageSize } = parsePagination(url.searchParams);
  const boundedPageSize = Math.min(pageSize, MAX_PAGE_SIZE);

  const { rows, total } = await new PrismaPipelineRunStore().listRuns({
    jobName: MARKET_DATA_PIPELINE_JOB_NAME,
    page,
    pageSize: boundedPageSize,
  });

  return listResponse(rows.map(toSchedulerRunRecord), {
    total,
    page,
    pageSize: boundedPageSize,
  });
}
