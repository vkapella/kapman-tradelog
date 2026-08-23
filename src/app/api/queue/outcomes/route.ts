import { detailResponse, errorResponse } from "@/lib/api/responses";
import {
  createOutcome,
  QueueConflictError,
  QueueNotFoundError,
  QueueValidationError,
} from "@/lib/queue/store";
import { outcomeCreateSchema } from "@/lib/queue/types";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse("INVALID_JSON", "Request body must be valid JSON", []);
  }
  const parsed = outcomeCreateSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse(
      "INVALID_OUTCOME",
      "Body must be a fresh-run outcome per HITL_QUEUE_CONTRACT_v4.0",
      parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`),
    );
  }
  try {
    const result = await createOutcome(parsed.data);
    return detailResponse(result);
  } catch (error) {
    if (error instanceof QueueNotFoundError) return errorResponse("QUEUE_ITEM_NOT_FOUND", error.message, [], 404);
    if (error instanceof QueueConflictError) return errorResponse("QUEUE_CONFLICT", error.message, [], 409);
    if (error instanceof QueueValidationError) return errorResponse("QUEUE_INVALID", error.message, [], 422);
    throw error;
  }
}
