import { Prisma } from "@prisma/client";
import { detailResponse, errorResponse, listResponse, parsePagination } from "@/lib/api/responses";
import { prisma } from "@/lib/db/prisma";
import {
  RECOMMENDATION_DISPOSITIONS,
  RECOMMENDATION_PASSES,
  recommendationIngestArraySchema,
} from "@/lib/recommendations/types";
import { upsertRecommendations } from "@/lib/recommendations/upsert";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const { page, pageSize } = parsePagination(url.searchParams);
  const pass = url.searchParams.get("pass") ?? undefined;
  const disposition = url.searchParams.get("disposition") ?? undefined;
  const ticker = url.searchParams.get("ticker") ?? undefined;
  const lineageId = url.searchParams.get("lineageId") ?? undefined;

  if (pass && !(RECOMMENDATION_PASSES as readonly string[]).includes(pass)) {
    return errorResponse("INVALID_PASS", `pass must be one of ${RECOMMENDATION_PASSES.join(", ")}`, []);
  }
  if (disposition && !(RECOMMENDATION_DISPOSITIONS as readonly string[]).includes(disposition)) {
    return errorResponse(
      "INVALID_DISPOSITION",
      `disposition must be one of ${RECOMMENDATION_DISPOSITIONS.join(", ")}`,
      [],
    );
  }

  const where: Prisma.TradeRecommendationWhereInput = {
    ...(pass ? { pass: pass as Prisma.TradeRecommendationWhereInput["pass"] } : {}),
    ...(disposition ? { disposition: disposition as Prisma.TradeRecommendationWhereInput["disposition"] } : {}),
    ...(ticker ? { ticker: ticker.toUpperCase() } : {}),
    ...(lineageId ? { lineageId } : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.tradeRecommendation.findMany({
      where,
      orderBy: [{ asOf: "desc" }, { recId: "asc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.tradeRecommendation.count({ where }),
  ]);

  return listResponse(rows, { page, pageSize, total });
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse("INVALID_JSON", "Request body must be valid JSON", []);
  }

  const parsed = recommendationIngestArraySchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse(
      "INVALID_RECOMMENDATIONS",
      "Request body must be a non-empty array of recommendation rows",
      parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`),
    );
  }

  const recIds = new Set(parsed.data.map((row) => row.recId));
  if (recIds.size !== parsed.data.length) {
    return errorResponse("DUPLICATE_REC_IDS", "Payload contains duplicate recId values", []);
  }

  const result = await upsertRecommendations(parsed.data);
  return detailResponse(result);
}
