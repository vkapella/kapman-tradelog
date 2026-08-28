import { beforeEach, describe, expect, it, vi } from "vitest";

const accountRouteMocks = vi.hoisted(() => {
  return {
    account: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    legalEntity: {
      findUnique: vi.fn(),
    },
  };
});

vi.mock("@/lib/db/prisma", () => {
  return {
    prisma: {
      account: accountRouteMocks.account,
      legalEntity: accountRouteMocks.legalEntity,
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
        dataRevision: { increment: 1 },
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

  it("classifies an account under a legal entity by slug", async () => {
    accountRouteMocks.legalEntity.findUnique.mockResolvedValueOnce({ id: "le_kapman_capital" });
    accountRouteMocks.account.findUnique.mockResolvedValueOnce({
      id: "acct-1",
      accountId: "C-1001",
      displayLabel: "Kapman Capital",
      brokerName: "Schwab",
      startingCapital: null,
      paperMoney: false,
      legalEntity: null,
      createdAt: new Date("2026-08-26T00:00:00.000Z"),
    });
    accountRouteMocks.account.update.mockResolvedValueOnce({
      id: "acct-1",
      accountId: "C-1001",
      displayLabel: "Kapman Capital",
      brokerName: "Schwab",
      startingCapital: null,
      paperMoney: false,
      legalEntity: { slug: "kapman-capital", legalName: "Kapman Capital Inc.", kind: "CORPORATION" },
      createdAt: new Date("2026-08-26T00:00:00.000Z"),
    });

    const { PATCH } = await import("./route");
    const response = await PATCH(
      new Request("http://localhost/api/accounts/acct-1", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ legalEntitySlug: "kapman-capital" }),
      }),
      { params: { id: "acct-1" } },
    );
    const payload = (await response.json()) as { data: { legalEntity: { slug: string } | null } };

    expect(response.status).toBe(200);
    expect(accountRouteMocks.legalEntity.findUnique).toHaveBeenCalledWith({
      where: { slug: "kapman-capital" },
      select: { id: true },
    });
    expect(accountRouteMocks.account.update).toHaveBeenCalledWith({
      where: { id: "acct-1" },
      data: { legalEntityId: "le_kapman_capital" },
      select: expect.any(Object),
    });
    expect(payload.data.legalEntity?.slug).toBe("kapman-capital");
  });

  it("rejects an unknown legal entity slug without updating", async () => {
    accountRouteMocks.legalEntity.findUnique.mockResolvedValueOnce(null);

    const { PATCH } = await import("./route");
    const response = await PATCH(
      new Request("http://localhost/api/accounts/acct-1", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ legalEntitySlug: "no-such-entity" }),
      }),
      { params: { id: "acct-1" } },
    );
    const payload = (await response.json()) as { error: { code: string } };

    expect(response.status).toBe(400);
    expect(payload.error.code).toBe("UNKNOWN_LEGAL_ENTITY");
    expect(accountRouteMocks.account.update).not.toHaveBeenCalled();
  });

  it("unclassifies an account with a null legalEntitySlug", async () => {
    accountRouteMocks.account.findUnique.mockResolvedValueOnce({
      id: "acct-1",
      accountId: "C-1001",
      displayLabel: "Kapman Capital",
      brokerName: "Schwab",
      startingCapital: null,
      paperMoney: false,
      legalEntity: { slug: "kapman-capital", legalName: "Kapman Capital Inc.", kind: "CORPORATION" },
      createdAt: new Date("2026-08-26T00:00:00.000Z"),
    });
    accountRouteMocks.account.update.mockResolvedValueOnce({
      id: "acct-1",
      accountId: "C-1001",
      displayLabel: "Kapman Capital",
      brokerName: "Schwab",
      startingCapital: null,
      paperMoney: false,
      legalEntity: null,
      createdAt: new Date("2026-08-26T00:00:00.000Z"),
    });

    const { PATCH } = await import("./route");
    const response = await PATCH(
      new Request("http://localhost/api/accounts/acct-1", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ legalEntitySlug: null }),
      }),
      { params: { id: "acct-1" } },
    );
    const payload = (await response.json()) as { data: { legalEntity: { slug: string } | null } };

    expect(response.status).toBe(200);
    expect(accountRouteMocks.legalEntity.findUnique).not.toHaveBeenCalled();
    expect(accountRouteMocks.account.update).toHaveBeenCalledWith({
      where: { id: "acct-1" },
      data: { legalEntityId: null },
      select: expect.any(Object),
    });
    expect(payload.data.legalEntity).toBeNull();
  });
});
