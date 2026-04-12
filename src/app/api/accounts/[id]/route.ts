import { z } from "zod";
import { detailResponse, errorResponse } from "@/lib/api/responses";
import { mapAccountRowToRecord } from "@/lib/accounts/api";
import { prisma } from "@/lib/db/prisma";

const updateAccountSchema = z
  .object({
    displayLabel: z.string().trim().max(120).nullable().optional(),
    brokerName: z.string().trim().max(120).nullable().optional(),
    startingCapital: z.union([z.number(), z.string(), z.null()]).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field must be provided.",
  });

function normalizeText(value: string | null | undefined): string | null | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (value === null) {
    return null;
  }

  return value.trim().length > 0 ? value.trim() : null;
}

function normalizeStartingCapital(value: string | number | null | undefined): string | null | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (value === null || value === "") {
    return null;
  }

  const amount = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(amount) || amount < 0) {
    throw new Error("startingCapital must be a non-negative number.");
  }

  return amount.toFixed(2);
}

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse("INVALID_JSON", "Body must be valid JSON.", ["Unable to parse request body."]);
  }

  const parsed = updateAccountSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse(
      "VALIDATION_ERROR",
      "Account payload is invalid.",
      parsed.error.issues.map((issue) => `${issue.path.join(".") || "body"}: ${issue.message}`),
    );
  }

  let startingCapital: string | null | undefined;
  try {
    startingCapital = normalizeStartingCapital(parsed.data.startingCapital);
  } catch (error) {
    return errorResponse("VALIDATION_ERROR", "Account payload is invalid.", [error instanceof Error ? error.message : "Invalid starting capital."]);
  }

  const existing = await prisma.account.findUnique({
    where: { id: params.id },
    select: {
      id: true,
      accountId: true,
      displayLabel: true,
      brokerName: true,
      startingCapital: true,
      createdAt: true,
    },
  });

  if (!existing) {
    return errorResponse("ACCOUNT_NOT_FOUND", "Account not found.", [`No account exists for id ${params.id}.`], 404);
  }

  const updated = await prisma.account.update({
    where: { id: params.id },
    data: {
      ...(parsed.data.displayLabel !== undefined ? { displayLabel: normalizeText(parsed.data.displayLabel) } : {}),
      ...(parsed.data.brokerName !== undefined ? { brokerName: normalizeText(parsed.data.brokerName) } : {}),
      ...(startingCapital !== undefined ? { startingCapital } : {}),
    },
    select: {
      id: true,
      accountId: true,
      displayLabel: true,
      brokerName: true,
      startingCapital: true,
      createdAt: true,
    },
  });

  return detailResponse(mapAccountRowToRecord(updated));
}
