// #344: GET/PUT /api/profile — identity-only addressing, the expected-identity
// guard (rejection-only, checked before any database access), stored-state
// semantics, validation, and size caps. Prisma is replaced with an in-memory
// stub; the CAS mechanics themselves are covered in store.test.ts.

import { afterEach, describe, expect, it, vi } from "vitest";
import { cloneDefaultProfile } from "@/lib/profile/schema";
import type { ProfileGetResponse, ProfilePutResponse } from "@/types/api";

interface StubRow {
  email: string;
  settings: unknown;
  revision: bigint;
  updatedAt: Date;
}

const db = vi.hoisted(() => {
  const state = {
    rows: new Map<string, StubRow>(),
    findCalls: 0,
    writeCalls: 0,
  };
  return state;
});

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    userProfile: {
      findUnique: async ({ where }: { where: { email: string } }) => {
        db.findCalls += 1;
        const row = db.rows.get(where.email);
        return row ? { ...row } : null;
      },
      create: async ({ data }: { data: { email: string; settings: unknown } }) => {
        db.writeCalls += 1;
        const row: StubRow = { email: data.email, settings: data.settings, revision: BigInt(0), updatedAt: new Date() };
        db.rows.set(data.email, row);
        return { ...row };
      },
      updateMany: async ({
        where,
        data,
      }: {
        where: { email: string; revision: bigint };
        data: { settings: unknown };
      }) => {
        db.writeCalls += 1;
        const row = db.rows.get(where.email);
        if (!row || row.revision !== where.revision) {
          return { count: 0 };
        }
        db.rows.set(where.email, {
          ...row,
          settings: data.settings,
          revision: row.revision + BigInt(1),
          updatedAt: new Date(),
        });
        return { count: 1 };
      },
    },
  },
}));

import { GET, PUT } from "@/app/api/profile/route";

const VICTOR = "victor.kapella@kapmancapital.com";
const RON = "ron.nyman@kapmancapital.com";

function buildRequest(options: {
  method?: string;
  identity?: string | null;
  expected?: string | null;
  body?: unknown;
  rawBody?: string;
}): Request {
  const headers: Record<string, string> = {};
  if (options.identity) headers["x-kapman-user"] = options.identity;
  if (options.expected) headers["x-kapman-expected-user"] = options.expected;
  const rawBody = options.rawBody ?? (options.body !== undefined ? JSON.stringify(options.body) : undefined);
  return new Request("https://tradelog.kapmancapital.com/api/profile", {
    method: options.method ?? "GET",
    headers,
    body: rawBody,
  });
}

afterEach(() => {
  db.rows.clear();
  db.findCalls = 0;
  db.writeCalls = 0;
});

describe("GET /api/profile", () => {
  it("403 with no trusted identity (service token / bearer caller)", async () => {
    const response = await GET(buildRequest({ expected: VICTOR }));
    expect(response.status).toBe(403);
    expect(db.findCalls).toBe(0);
  });

  it("409 IDENTITY_CHANGED on a missing or mismatched guard, before any DB read", async () => {
    const missing = await GET(buildRequest({ identity: RON }));
    expect(missing.status).toBe(409);

    const mismatched = await GET(buildRequest({ identity: RON, expected: VICTOR }));
    expect(mismatched.status).toBe(409);
    const body = (await mismatched.json()) as { error: { code: string } };
    expect(body.error.code).toBe("IDENTITY_CHANGED");
    expect(db.findCalls).toBe(0);
  });

  it("no row: defaults with isDefault true, writable true, revision 0", async () => {
    const response = await GET(buildRequest({ identity: VICTOR, expected: VICTOR }));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    const body = (await response.json()) as { data: ProfileGetResponse };
    expect(body.data).toMatchObject({
      email: VICTOR,
      isDefault: true,
      writable: true,
      revision: "0",
      updatedAt: null,
    });
    expect(body.data.settings.accounts.selected).toEqual(["18528700SCHW"]);
  });

  it("a stored row that EQUALS the defaults is isDefault false (something usable is stored)", async () => {
    db.rows.set(VICTOR, { email: VICTOR, settings: cloneDefaultProfile(), revision: BigInt(3), updatedAt: new Date() });
    const response = await GET(buildRequest({ identity: VICTOR, expected: VICTOR }));
    const body = (await response.json()) as { data: ProfileGetResponse };
    expect(body.data.isDefault).toBe(false);
    expect(body.data.revision).toBe("3");
  });

  it("malformed row: defaults, isDefault true, writable true", async () => {
    db.rows.set(VICTOR, { email: VICTOR, settings: { garbage: 1 }, revision: BigInt(5), updatedAt: new Date() });
    const response = await GET(buildRequest({ identity: VICTOR, expected: VICTOR }));
    const body = (await response.json()) as { data: ProfileGetResponse };
    expect(body.data.isDefault).toBe(true);
    expect(body.data.writable).toBe(true);
  });

  it("newer-version row: defaults, writable false", async () => {
    db.rows.set(VICTOR, { email: VICTOR, settings: { version: 2 }, revision: BigInt(9), updatedAt: new Date() });
    const response = await GET(buildRequest({ identity: VICTOR, expected: VICTOR }));
    const body = (await response.json()) as { data: ProfileGetResponse };
    expect(body.data.isDefault).toBe(true);
    expect(body.data.writable).toBe(false);
  });
});

describe("PUT /api/profile", () => {
  function putRequest(body: unknown, identity: string | null = VICTOR, expected: string | null = identity): Request {
    return buildRequest({ method: "PUT", identity, expected, body });
  }

  it("guard mismatch (stale Victor tab, session now Ron): rejected, Ron's row untouched", async () => {
    db.rows.set(RON, { email: RON, settings: cloneDefaultProfile(), revision: BigInt(1), updatedAt: new Date() });

    // Middleware authenticates the request as Ron; the tab still expects Victor.
    const response = await PUT(putRequest({ patch: { accounts: { selected: ["X"] } } }, RON, VICTOR));

    expect(response.status).toBe(409);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe("IDENTITY_CHANGED");
    expect(db.writeCalls).toBe(0);
    expect(db.rows.get(RON)?.revision).toBe(BigInt(1));
  });

  it("single-leaf patch: lazily creates from defaults, other leaves verbatim", async () => {
    const response = await PUT(putRequest({ patch: { range: { preset: "ytd", startDate: null, endDate: null } } }));
    expect(response.status).toBe(200);
    const body = (await response.json()) as { data: ProfilePutResponse };
    expect(body.data.settings.range.preset).toBe("ytd");
    expect(body.data.settings.accounts.selected).toEqual(["18528700SCHW"]);
    expect(body.data.settings.dashboard).toEqual({ widgets: null, kpis: null });
  });

  it("widgets-only patch leaves KPIs untouched; per-table patch leaves other tables untouched", async () => {
    const seeded = cloneDefaultProfile();
    seeded.dashboard.kpis = ["realized-pnl"];
    seeded.tables.hiddenColumns = { executions: ["fees"], positions: ["mark"] };
    db.rows.set(VICTOR, { email: VICTOR, settings: seeded, revision: BigInt(0), updatedAt: new Date() });

    const widgetsResponse = await PUT(putRequest({ patch: { dashboard: { widgets: [] } } }));
    const widgetsBody = (await widgetsResponse.json()) as { data: ProfilePutResponse };
    expect(widgetsBody.data.settings.dashboard.widgets).toEqual([]);
    expect(widgetsBody.data.settings.dashboard.kpis).toEqual(["realized-pnl"]);

    const tableResponse = await PUT(putRequest({ patch: { tables: { hiddenColumns: { executions: null } } } }));
    const tableBody = (await tableResponse.json()) as { data: ProfilePutResponse };
    expect(tableBody.data.settings.tables.hiddenColumns).toEqual({ positions: ["mark"] });
  });

  it("400 on empty patch, unknown keys, duplicates, and range violations", async () => {
    expect((await PUT(putRequest({ patch: {} }))).status).toBe(400);
    expect((await PUT(putRequest({ patch: { rogue: true } }))).status).toBe(400);
    expect((await PUT(putRequest({ patch: { accounts: { selected: ["A", "A"] } } }))).status).toBe(400);
    expect(
      (await PUT(putRequest({ patch: { range: { preset: "ytd", startDate: "2026-01-01", endDate: "2026-02-01" } } })))
        .status,
    ).toBe(400);
    expect((await PUT(putRequest({ patch: { tables: { hiddenColumns: {} } } }))).status).toBe(400);
    expect(db.writeCalls).toBe(0);
  });

  it("413 on a raw body over 64 KiB, before JSON.parse", async () => {
    const rawBody = `{"patch":{"accounts":{"selected":["${"x".repeat(70 * 1024)}"]}}}`;
    const response = await PUT(buildRequest({ method: "PUT", identity: VICTOR, expected: VICTOR, rawBody }));
    expect(response.status).toBe(413);
    expect(db.findCalls).toBe(0);
  });

  it("409 UNSUPPORTED_PROFILE_VERSION for a newer-version row, which stays untouched", async () => {
    const futureDoc = { version: 3, future: true };
    db.rows.set(VICTOR, { email: VICTOR, settings: futureDoc, revision: BigInt(2), updatedAt: new Date() });

    const response = await PUT(putRequest({ patch: { accounts: { selected: ["A"] } } }));
    expect(response.status).toBe(409);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe("UNSUPPORTED_PROFILE_VERSION");
    expect(db.rows.get(VICTOR)?.settings).toEqual(futureDoc);
    expect(db.rows.get(VICTOR)?.revision).toBe(BigInt(2));
  });

  it("403 without a trusted identity", async () => {
    const response = await PUT(putRequest({ patch: { accounts: { selected: ["A"] } } }, null, VICTOR));
    expect(response.status).toBe(403);
  });
});
