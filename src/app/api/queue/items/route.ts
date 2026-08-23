import { detailResponse, errorResponse, listResponse } from "@/lib/api/responses";
import {
  ingestQueueItem,
  listQueueItems,
  QueueConflictError,
  QueueValidationError,
} from "@/lib/queue/store";
import { queueItemIngestSchema } from "@/lib/queue/types";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const status = url.searchParams.get("status") ?? undefined;
  if (status && !["PENDING", "DECLARED", "CONSUMED"].includes(status)) {
    return errorResponse("INVALID_STATUS", "status must be PENDING, DECLARED, or CONSUMED", []);
  }
  const views = await listQueueItems({
    status: status as "PENDING" | "DECLARED" | "CONSUMED" | undefined,
    ticker: url.searchParams.get("ticker") ?? undefined,
    lineageId: url.searchParams.get("lineageId") ?? undefined,
  });
  return listResponse(views, { page: 1, pageSize: views.length, total: views.length });
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse("INVALID_JSON", "Request body must be valid JSON", []);
  }
  const parsed = queueItemIngestSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse(
      "INVALID_QUEUE_ITEM",
      "Body must be a queue item per HITL_QUEUE_CONTRACT_v4.0",
      parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`),
    );
  }
  try {
    const result = await ingestQueueItem(parsed.data);
    return detailResponse(result);
  } catch (error) {
    if (error instanceof QueueConflictError) return errorResponse("QUEUE_CONFLICT", error.message, [], 409);
    if (error instanceof QueueValidationError) return errorResponse("QUEUE_INVALID", error.message, [], 422);
    throw error;
  }
}
