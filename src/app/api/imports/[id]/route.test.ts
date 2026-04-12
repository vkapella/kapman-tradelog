import { beforeEach, describe, expect, it, vi } from "vitest";

const importDeleteRouteMocks = vi.hoisted(() => {
  const tx = {
    dailyAccountSnapshot: {
      deleteMany: vi.fn(),
    },
    cashEvent: {
      deleteMany: vi.fn(),
    },
    matchedLot: {
      findMany: vi.fn(),
      deleteMany: vi.fn(),
    },
    setupGroupLot: {
      findMany: vi.fn(),
    },
    setupGroup: {
      deleteMany: vi.fn(),
    },
    importExecution: {
      createMany: vi.fn(),
      findMany: vi.fn(),
      deleteMany: vi.fn(),
      findFirst: vi.fn(),
    },
    execution: {
      findMany: vi.fn(),
      update: vi.fn(),
      deleteMany: vi.fn(),
    },
    manualAdjustment: {
      count: vi.fn(),
      deleteMany: vi.fn(),
    },
    import: {
      delete: vi.fn(),
    },
  };

  return {
    prisma: {
      import: {
        findUnique: vi.fn(),
      },
      $transaction: vi.fn(),
    },
    tx,
    rebuildAccountLedger: vi.fn(),
    rebuildAccountSetups: vi.fn(),
  };
});

vi.mock("@/lib/db/prisma", () => {
  return {
    prisma: importDeleteRouteMocks.prisma,
  };
});

vi.mock("@/lib/ledger/rebuild-account-ledger", () => {
  return {
    rebuildAccountLedger: importDeleteRouteMocks.rebuildAccountLedger,
  };
});

vi.mock("@/lib/analytics/rebuild-account-setups", () => {
  return {
    rebuildAccountSetups: importDeleteRouteMocks.rebuildAccountSetups,
  };
});

describe("DELETE /api/imports/[id]", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();

    importDeleteRouteMocks.prisma.$transaction.mockImplementation(async (callback: (tx: typeof importDeleteRouteMocks.tx) => unknown) => {
      return callback(importDeleteRouteMocks.tx);
    });

    importDeleteRouteMocks.tx.dailyAccountSnapshot.deleteMany.mockResolvedValue({ count: 0 });
    importDeleteRouteMocks.tx.cashEvent.deleteMany.mockResolvedValue({ count: 0 });
    importDeleteRouteMocks.tx.importExecution.createMany.mockResolvedValue({ count: 0 });
    importDeleteRouteMocks.tx.importExecution.findMany.mockResolvedValue([]);
    importDeleteRouteMocks.tx.importExecution.deleteMany.mockResolvedValue({ count: 0 });
    importDeleteRouteMocks.tx.importExecution.findFirst.mockResolvedValue(null);
    importDeleteRouteMocks.tx.execution.findMany.mockResolvedValue([]);
    importDeleteRouteMocks.tx.execution.update.mockResolvedValue({});
    importDeleteRouteMocks.tx.execution.deleteMany.mockResolvedValue({ count: 0 });
    importDeleteRouteMocks.tx.matchedLot.findMany.mockResolvedValue([]);
    importDeleteRouteMocks.tx.matchedLot.deleteMany.mockResolvedValue({ count: 0 });
    importDeleteRouteMocks.tx.setupGroupLot.findMany.mockResolvedValue([]);
    importDeleteRouteMocks.tx.setupGroup.deleteMany.mockResolvedValue({ count: 0 });
    importDeleteRouteMocks.tx.manualAdjustment.count.mockResolvedValue(0);
    importDeleteRouteMocks.tx.import.delete.mockResolvedValue({ id: "import-1" });

    importDeleteRouteMocks.rebuildAccountLedger.mockResolvedValue({
      matchedLotsPersisted: 0,
      syntheticExecutionsPersisted: 0,
      warnings: [],
    });
    importDeleteRouteMocks.rebuildAccountSetups.mockResolvedValue({
      setupGroupsPersisted: 0,
      uncategorizedCount: 0,
    });
  });

  it("deletes an UPLOADED import immediately without rebuild", async () => {
    importDeleteRouteMocks.prisma.import.findUnique.mockResolvedValueOnce({
      id: "import-1",
      accountId: "account-1",
      status: "UPLOADED",
    });

    const { DELETE } = await import("./route");
    const response = await DELETE(new Request("http://localhost/api/imports/import-1", { method: "DELETE" }), {
      params: { id: "import-1" },
    });

    const payload = (await response.json()) as { data: { rebuild: { ran: boolean }; deleted: { importRows: number } } };

    expect(payload.data.deleted.importRows).toBe(1);
    expect(payload.data.rebuild.ran).toBe(false);
    expect(importDeleteRouteMocks.rebuildAccountLedger).not.toHaveBeenCalled();
    expect(importDeleteRouteMocks.rebuildAccountSetups).not.toHaveBeenCalled();
  });

  it("deletes committed import data and removes orphaned executions", async () => {
    importDeleteRouteMocks.prisma.import.findUnique.mockResolvedValueOnce({
      id: "import-1",
      accountId: "account-1",
      status: "COMMITTED",
    });

    importDeleteRouteMocks.tx.execution.findMany
      .mockResolvedValueOnce([{ id: "exec-1" }])
      .mockResolvedValueOnce([{ id: "exec-1", importId: "import-1" }]);
    importDeleteRouteMocks.tx.importExecution.findMany.mockResolvedValueOnce([{ executionId: "exec-1" }]);
    importDeleteRouteMocks.tx.matchedLot.findMany.mockResolvedValueOnce([{ id: "lot-1" }]);
    importDeleteRouteMocks.tx.setupGroupLot.findMany.mockResolvedValueOnce([{ setupGroupId: "setup-1" }]);
    importDeleteRouteMocks.tx.setupGroup.deleteMany.mockResolvedValueOnce({ count: 1 });
    importDeleteRouteMocks.tx.matchedLot.deleteMany.mockResolvedValueOnce({ count: 1 });
    importDeleteRouteMocks.tx.importExecution.deleteMany.mockResolvedValueOnce({ count: 1 });
    importDeleteRouteMocks.tx.importExecution.findFirst.mockResolvedValueOnce(null);
    importDeleteRouteMocks.tx.execution.deleteMany.mockResolvedValueOnce({ count: 1 });

    const { DELETE } = await import("./route");
    const response = await DELETE(new Request("http://localhost/api/imports/import-1", { method: "DELETE" }), {
      params: { id: "import-1" },
    });

    const payload = (await response.json()) as {
      data: {
        rebuild: { ran: boolean };
        deleted: { executions: number; matchedLots: number; setupGroups: number; importExecutionLinks: number };
      };
    };

    expect(payload.data.deleted.executions).toBe(1);
    expect(payload.data.deleted.importExecutionLinks).toBe(1);
    expect(payload.data.deleted.matchedLots).toBe(1);
    expect(payload.data.deleted.setupGroups).toBe(1);
    expect(payload.data.rebuild.ran).toBe(true);
    expect(importDeleteRouteMocks.tx.execution.update).not.toHaveBeenCalled();
  });

  it("keeps shared executions by reassigning ownership to another linked import", async () => {
    importDeleteRouteMocks.prisma.import.findUnique.mockResolvedValueOnce({
      id: "import-1",
      accountId: "account-1",
      status: "COMMITTED",
    });

    importDeleteRouteMocks.tx.execution.findMany
      .mockResolvedValueOnce([{ id: "exec-1" }])
      .mockResolvedValueOnce([{ id: "exec-1", importId: "import-1" }]);
    importDeleteRouteMocks.tx.importExecution.findMany.mockResolvedValueOnce([{ executionId: "exec-1" }]);
    importDeleteRouteMocks.tx.importExecution.deleteMany.mockResolvedValueOnce({ count: 1 });
    importDeleteRouteMocks.tx.importExecution.findFirst.mockResolvedValueOnce({ importId: "import-2" });

    const { DELETE } = await import("./route");
    const response = await DELETE(new Request("http://localhost/api/imports/import-1", { method: "DELETE" }), {
      params: { id: "import-1" },
    });

    const payload = (await response.json()) as { data: { deleted: { executions: number }; reassignedExecutions: number } };

    expect(payload.data.deleted.executions).toBe(0);
    expect(payload.data.reassignedExecutions).toBe(1);
    expect(importDeleteRouteMocks.tx.execution.update).toHaveBeenCalledWith({
      where: { id: "exec-1" },
      data: { importId: "import-2" },
    });
    expect(importDeleteRouteMocks.tx.execution.deleteMany).not.toHaveBeenCalled();
  });

  it("never deletes manual adjustment rows during import deletion", async () => {
    importDeleteRouteMocks.prisma.import.findUnique.mockResolvedValueOnce({
      id: "import-1",
      accountId: "account-1",
      status: "COMMITTED",
    });
    importDeleteRouteMocks.tx.manualAdjustment.count.mockResolvedValueOnce(6);

    const { DELETE } = await import("./route");
    const response = await DELETE(new Request("http://localhost/api/imports/import-1", { method: "DELETE" }), {
      params: { id: "import-1" },
    });

    const payload = (await response.json()) as { data: { manualAdjustmentsPreserved: number } };

    expect(payload.data.manualAdjustmentsPreserved).toBe(6);
    expect(importDeleteRouteMocks.tx.manualAdjustment.deleteMany).not.toHaveBeenCalled();
  });
});
