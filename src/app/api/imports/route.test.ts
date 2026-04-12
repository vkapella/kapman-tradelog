import { beforeEach, describe, expect, it, vi } from "vitest";

const importsRouteMocks = vi.hoisted(() => {
  return {
    import: {
      count: vi.fn(),
      findMany: vi.fn(),
    },
    importExecutionDelegate: null as { groupBy: ReturnType<typeof vi.fn> } | null,
  };
});

vi.mock("@/lib/db/prisma", () => {
  return {
    prisma: {
      import: importsRouteMocks.import,
      get importExecution() {
        return importsRouteMocks.importExecutionDelegate;
      },
    },
  };
});

describe("GET /api/imports", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    importsRouteMocks.importExecutionDelegate = null;
  });

  it("falls back to execution relation counts when importExecution delegate is unavailable", async () => {
    importsRouteMocks.import.count.mockResolvedValueOnce(1);
    importsRouteMocks.import.findMany.mockResolvedValueOnce([
      {
        id: "import-1",
        filename: "statement.csv",
        broker: "FIDELITY",
        account: { accountId: "X19467537" },
        status: "COMMITTED",
        parsedRows: 10,
        persistedRows: 8,
        skippedDuplicateRows: 1,
        failedRows: 0,
        skippedRows: 1,
        createdAt: new Date("2026-04-12T00:00:00.000Z"),
        _count: {
          executions: 8,
        },
      },
    ]);

    const { GET } = await import("./route");
    const response = await GET(new Request("http://localhost/api/imports?page=1&pageSize=25"));
    const payload = (await response.json()) as { data: Array<{ insertedExecutions: number }> };

    expect(payload.data[0]?.insertedExecutions).toBe(8);
  });

  it("prefers importExecution grouped counts when delegate is available", async () => {
    importsRouteMocks.importExecutionDelegate = {
      groupBy: vi.fn().mockResolvedValueOnce([
        {
          importId: "import-1",
          _count: {
            _all: 2,
          },
        },
      ]),
    };

    importsRouteMocks.import.count.mockResolvedValueOnce(1);
    importsRouteMocks.import.findMany.mockResolvedValueOnce([
      {
        id: "import-1",
        filename: "statement.csv",
        broker: "FIDELITY",
        account: { accountId: "X19467537" },
        status: "COMMITTED",
        parsedRows: 10,
        persistedRows: 8,
        skippedDuplicateRows: 1,
        failedRows: 0,
        skippedRows: 1,
        createdAt: new Date("2026-04-12T00:00:00.000Z"),
        _count: {
          executions: 8,
        },
      },
    ]);

    const { GET } = await import("./route");
    const response = await GET(new Request("http://localhost/api/imports?page=1&pageSize=25"));
    const payload = (await response.json()) as { data: Array<{ insertedExecutions: number }> };

    expect(payload.data[0]?.insertedExecutions).toBe(2);
  });
});
