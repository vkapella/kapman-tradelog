import { Prisma } from "@prisma/client";
import { detailResponse, errorResponse, listResponse, parsePagination } from "@/lib/api/responses";
import { prisma } from "@/lib/db/prisma";
import { manualAdjustmentCreateSchema, parsePayloadByType } from "@/lib/adjustments/types";
import type { ManualAdjustmentRecord } from "@/types/api";

function mapRowToRecord(row: {
  id: string;
  createdAt: Date;
  createdBy: string;
  accountId: string;
  symbol: string;
  effectiveDate: Date;
  adjustmentType: "SPLIT" | "QTY_OVERRIDE" | "PRICE_OVERRIDE" | "ADD_POSITION" | "REMOVE_POSITION";
  payloadJson: Prisma.JsonValue;
  reason: string;
  evidenceRef: string | null;
  status: "ACTIVE" | "REVERSED";
  reversedByAdjustmentId: string | null;
  account: { accountId: string };
}): ManualAdjustmentRecord {
  return {
    id: row.id,
    createdAt: row.createdAt.toISOString(),
    createdBy: row.createdBy,
    accountId: row.accountId,
    accountExternalId: row.account.accountId,
    symbol: row.symbol,
    effectiveDate: row.effectiveDate.toISOString(),
    adjustmentType: row.adjustmentType,
    payload: parsePayloadByType(row.adjustmentType, row.payloadJson),
    reason: row.reason,
    evidenceRef: row.evidenceRef,
    status: row.status,
    reversedByAdjustmentId: row.reversedByAdjustmentId,
  };
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const { page, pageSize } = parsePagination(url.searchParams);
  const accountId = url.searchParams.get("accountId") ?? undefined;
  const symbol = url.searchParams.get("symbol") ?? undefined;
  const status = url.searchParams.get("status") ?? undefined;

  const where: Record<string, unknown> = {};
  if (accountId) {
    where.accountId = accountId;
  }
  if (symbol) {
    where.symbol = { equals: symbol.toUpperCase(), mode: "insensitive" as const };
  }
  if (status === "ACTIVE" || status === "REVERSED") {
    where.status = status;
  }

  const [total, rows] = await Promise.all([
    prisma.manualAdjustment.count({ where }),
    prisma.manualAdjustment.findMany({
      where,
      include: {
        account: {
          select: { accountId: true },
        },
      },
      orderBy: [{ effectiveDate: "asc" }, { createdAt: "asc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);

  const data = rows.map(mapRowToRecord);
  return listResponse(data, { total, page, pageSize });
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse("INVALID_JSON", "Body must be valid JSON.", ["Unable to parse request body."]);
  }

  const parsed = manualAdjustmentCreateSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse(
      "VALIDATION_ERROR",
      "Adjustment payload is invalid.",
      parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`),
    );
  }

  const input = parsed.data;
  let payload;
  try {
    payload = parsePayloadByType(input.adjustmentType, input.payload);
  } catch (error) {
    return errorResponse("INVALID_PAYLOAD", "Payload does not match adjustment type.", [
      error instanceof Error ? error.message : "Unknown payload validation error.",
    ]);
  }

  const account = await prisma.account.findUnique({
    where: { id: input.accountId },
    select: { id: true, accountId: true },
  });
  if (!account) {
    return errorResponse("ACCOUNT_NOT_FOUND", "Account not found.", [`No account for id ${input.accountId}.`], 404);
  }

  const created = await prisma.manualAdjustment.create({
    data: {
      createdBy: input.createdBy?.trim() || "local-user",
      accountId: input.accountId,
      symbol: input.symbol.toUpperCase(),
      effectiveDate: new Date(input.effectiveDate),
      adjustmentType: input.adjustmentType,
      payloadJson: payload as unknown as Prisma.InputJsonValue,
      reason: input.reason.trim(),
      evidenceRef: input.evidenceRef?.trim() || null,
      status: "ACTIVE",
    },
    include: {
      account: { select: { accountId: true } },
    },
  });

  return detailResponse(mapRowToRecord(created));
}
