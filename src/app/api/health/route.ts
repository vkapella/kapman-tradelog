import { prisma } from "@/lib/db/prisma";
import { detailResponse } from "@/lib/api/responses";
import type { HealthResponse } from "@/types/api";

export async function GET() {
  try {
    await prisma.account.count();
    const payload: HealthResponse = { status: "ok", db: "connected" };
    return detailResponse(payload);
  } catch {
    const payload: HealthResponse = { status: "degraded", db: "disconnected" };
    return detailResponse(payload);
  }
}
