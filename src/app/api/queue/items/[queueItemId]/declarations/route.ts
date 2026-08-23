import { detailResponse, errorResponse } from "@/lib/api/responses";
import {
  createDeclaration,
  QueueConflictError,
  QueueNotFoundError,
  QueueValidationError,
} from "@/lib/queue/store";
import { declarationCreateSchema } from "@/lib/queue/types";

export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: { queueItemId: string } }) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse("INVALID_JSON", "Request body must be valid JSON", []);
  }
  const parsed = declarationCreateSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse(
      "INVALID_DECLARATION",
      "Body must be a declaration per HITL_QUEUE_CONTRACT_v4.0",
      parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`),
    );
  }
  try {
    const row = await createDeclaration(params.queueItemId, parsed.data);
    return detailResponse({
      declarationId: row.declarationId,
      queueItemId: row.queueItemId,
      statement: row.statement,
      statedAt: row.statedAt.toISOString(),
    });
  } catch (error) {
    if (error instanceof QueueNotFoundError) return errorResponse("QUEUE_ITEM_NOT_FOUND", error.message, [], 404);
    if (error instanceof QueueConflictError) return errorResponse("QUEUE_CONFLICT", error.message, [], 409);
    if (error instanceof QueueValidationError) return errorResponse("QUEUE_INVALID", error.message, [], 422);
    throw error;
  }
}
