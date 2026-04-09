import { prisma } from "@/lib/db/prisma";
import type { HealthResponse } from "@/types/api";

export async function GET() {
  try {
    await prisma.account.count();
    const payload: HealthResponse = { status: "ok", db: "connected" };
    return Response.json(payload, { status: 200 });
  } catch {
    const payload: HealthResponse = { status: "degraded", db: "disconnected" };
    return Response.json(payload, { status: 503 });
  }
}
