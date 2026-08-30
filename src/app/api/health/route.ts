import { prisma } from "@/lib/db/prisma";
import type { HealthResponse } from "@/types/api";

// Release identity baked at image build (Dockerfile ARG -> ENV, set by
// scripts/deploy.sh from git describe). "dev" when running locally.
function releaseFields(): Pick<HealthResponse, "version" | "sha" | "machineId"> {
  return {
    version: process.env.APP_VERSION ?? "dev",
    sha: process.env.APP_GIT_SHA ?? null,
    machineId: process.env.FLY_MACHINE_ID ?? null,
  };
}

export async function GET() {
  try {
    await prisma.account.count();
    const payload: HealthResponse = { status: "ok", db: "connected", ...releaseFields() };
    return Response.json(payload, { status: 200 });
  } catch {
    const payload: HealthResponse = { status: "degraded", db: "disconnected", ...releaseFields() };
    return Response.json(payload, { status: 503 });
  }
}
