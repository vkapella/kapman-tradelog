import { detailResponse, errorResponse } from "@/lib/api/responses";
import { startPositionSnapshotCompute } from "@/lib/positions/compute-position-snapshot";

interface SnapshotComputeRequestBody {
  accountIds?: string[];
}

function parseBody(value: unknown): SnapshotComputeRequestBody | null {
  if (value === null || typeof value !== "object") {
    return null;
  }

  const candidate = value as { accountIds?: unknown };
  if (
    candidate.accountIds !== undefined &&
    (!Array.isArray(candidate.accountIds) || candidate.accountIds.some((item) => typeof item !== "string"))
  ) {
    return null;
  }

  return {
    accountIds: candidate.accountIds,
  };
}

export async function POST(request: Request) {
  let parsedBody: SnapshotComputeRequestBody = {};

  try {
    const rawBody = (await request.json().catch(() => ({}))) as unknown;
    const body = parseBody(rawBody);
    if (body === null) {
      return errorResponse("INVALID_BODY", "Unable to parse snapshot compute request.", [
        "Expected body shape: { accountIds?: string[] }.",
      ]);
    }
    parsedBody = body;
  } catch {
    return errorResponse("INVALID_BODY", "Unable to parse snapshot compute request.", [
      "Expected body shape: { accountIds?: string[] }.",
    ]);
  }

  const payload = await startPositionSnapshotCompute(parsedBody.accountIds ?? []);
  return detailResponse(payload);
}
