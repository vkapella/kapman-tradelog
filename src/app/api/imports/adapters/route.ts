import type { AdapterSummaryRecord } from "@/types/api";
import { listAdapters } from "@/lib/adapters/registry";
import { listResponse } from "@/lib/api/responses";

export async function GET() {
  const adapters = listAdapters();
  const data: AdapterSummaryRecord[] = adapters.map((adapter) => ({
    id: adapter.id,
    name: adapter.id,
    displayName: adapter.displayName,
    fileExtensions: [".csv"],
    status: adapter.status,
    coverage: adapter.coverage(),
  }));

  return listResponse(data, {
    total: data.length,
    page: 1,
    pageSize: data.length,
  });
}
