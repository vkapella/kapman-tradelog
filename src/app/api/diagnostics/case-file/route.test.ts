import { beforeEach, describe, expect, it, vi } from "vitest";

const diagnosticsCaseFileRouteMocks = vi.hoisted(() => {
  return {
    execution: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
    },
    matchedLot: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
    },
    setupGroup: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
    },
  };
});

vi.mock("@/lib/db/prisma", () => {
  return {
    prisma: {
      execution: diagnosticsCaseFileRouteMocks.execution,
      matchedLot: diagnosticsCaseFileRouteMocks.matchedLot,
      setupGroup: diagnosticsCaseFileRouteMocks.setupGroup,
    },
  };
});

describe("GET /api/diagnostics/case-file", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("returns 404 for execution case files outside selected account scope", async () => {
    diagnosticsCaseFileRouteMocks.execution.findUnique.mockResolvedValueOnce({
      id: "execution-1",
      accountId: "internal-a",
      account: { accountId: "external-a" },
    });
    const { GET } = await import("./route");

    const response = await GET(
      new Request("http://localhost/api/diagnostics/case-file?kind=execution&executionId=execution-1&accountIds=internal-b"),
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({
        error: expect.objectContaining({
          code: "NOT_FOUND",
        }),
      }),
    );
  });
});
