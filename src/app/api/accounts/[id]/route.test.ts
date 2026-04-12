import { beforeEach, describe, expect, it, vi } from "vitest";

const accountRouteMocks = vi.hoisted(() => {
  return {
    account: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  };
});

vi.mock("@/lib/db/prisma", () => {
  return {
    prisma: {
      account: accountRouteMocks.account,
    },
  };
});

describe("PATCH /api/accounts/[id]", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("rejects negative starting capital", async () => {
    const { PATCH } = await import("./route");
    const response = await PATCH(
      new Request("http://localhost/api/accounts/acct-1", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ startingCapital: -1 }),
      }),
      { params: { id: "acct-1" } },
    );

    expect(response.status).toBe(400);
    expect(accountRouteMocks.account.findUnique).not.toHaveBeenCalled();
  });

  it("updates partial account metadata", async () => {
    accountRouteMocks.account.findUnique.mockResolvedValueOnce({
      id: "acct-1",
      accountId: "D-68011053",
      displayLabel: "Old label",
      brokerName: "Schwab",
      startingCapital: { toString: () => "100000" },
      createdAt: new Date("2026-04-12T00:00:00.000Z"),
    });
    accountRouteMocks.account.update.mockResolvedValueOnce({
      id: "acct-1",
      accountId: "D-68011053",
      displayLabel: "Schwab IRA",
      brokerName: "Schwab",
      startingCapital: { toString: () => "125000.00" },
      createdAt: new Date("2026-04-12T00:00:00.000Z"),
    });

    const { PATCH } = await import("./route");
    const response = await PATCH(
      new Request("http://localhost/api/accounts/acct-1", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayLabel: "Schwab IRA", startingCapital: "125000" }),
      }),
      { params: { id: "acct-1" } },
    );
    const payload = (await response.json()) as { data: { displayLabel: string | null; startingCapital: string | null } };

    expect(accountRouteMocks.account.update).toHaveBeenCalledWith({
      where: { id: "acct-1" },
      data: {
        displayLabel: "Schwab IRA",
        startingCapital: "125000.00",
      },
      select: expect.any(Object),
    });
    expect(payload.data).toEqual(
      expect.objectContaining({
        displayLabel: "Schwab IRA",
        startingCapital: "125000.00",
      }),
    );
  });
});
