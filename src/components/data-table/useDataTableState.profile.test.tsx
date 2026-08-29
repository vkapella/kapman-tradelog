// @vitest-environment jsdom
// #344: hidden columns have ONE authority — the profile. In profile mode the
// hook seeds from the hydrated profile (sanitized against the table's own
// columns), reports only its own table's leaf, and sessionStorage round-trips
// filters + sort ONLY (a stale hiddenColumns field in an old payload is
// ignored). Without a provider, visibility is in-memory.

import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useDataTableState } from "@/components/data-table/useDataTableState";
import type { DataTableColumnDefinition } from "@/components/data-table/types";
import { ProfileProvider } from "@/contexts/ProfileContext";
import { cloneDefaultProfile } from "@/lib/profile/schema";
import type { ProfileSettingsV1 } from "@/types/api";

vi.mock("@/store/openPositionsStore", () => ({ openPositionsStore: { hydrate: vi.fn() } }));

const VICTOR = "victor.kapella@kapmancapital.com";

function columns(ids: string[]): DataTableColumnDefinition<{ id: string }>[] {
  return ids.map(
    (id) => ({ id, label: id, getSortValue: () => id }) as unknown as DataTableColumnDefinition<{ id: string }>,
  );
}

const putCalls: Array<{ patch: unknown }> = [];

function stubFetch(settings: ProfileSettingsV1) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: unknown, init?: { method?: string; body?: string }) => {
      const u = String(url);
      if (u.startsWith("/api/profile") && init?.method === "PUT") {
        putCalls.push(JSON.parse(init.body ?? "{}") as { patch: unknown });
        return {
          ok: true,
          status: 200,
          json: async () => ({ data: { settings, revision: "2", updatedAt: "2026-08-29T00:00:00.000Z" } }),
        };
      }
      if (u.startsWith("/api/profile")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            data: { email: VICTOR, settings, isDefault: false, writable: true, revision: "1", updatedAt: null },
          }),
        };
      }
      return { ok: false, status: 500, json: async () => ({}) };
    }),
  );
}

function wrapper({ children }: { children: React.ReactNode }) {
  return <ProfileProvider identity={VICTOR}>{children}</ProfileProvider>;
}

beforeEach(() => {
  window.sessionStorage.clear();
  window.localStorage.clear();
  putCalls.length = 0;
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  vi.useRealTimers();
});

describe("useDataTableState in profile mode", () => {
  it("seeds from the profile sanitized to current columns; ignores stale session hiddenColumns; persists filters/sort only", async () => {
    const settings = cloneDefaultProfile();
    settings.tables.hiddenColumns = { executions: ["fees", "ghost-column"] };
    stubFetch(settings);

    // A pre-#344 session payload with hiddenColumns must be ignored.
    window.sessionStorage.setItem(
      "kapman_table_filters_executions",
      JSON.stringify({ filters: {}, sort: { columnId: null, direction: null }, hiddenColumns: ["qty"] }),
    );

    const { result } = renderHook(
      () => useDataTableState({ tableName: "executions", rows: [], columns: columns(["fees", "qty", "price"]) }),
      { wrapper },
    );

    await waitFor(() => expect(result.current).not.toBeNull());
    await waitFor(() => expect(result.current.isHydrated).toBe(true));

    // Profile value sanitized for display ("ghost-column" is not a real
    // column); the stale session value ("qty") never applied.
    expect(result.current.hiddenColumns).toEqual(["fees"]);

    // The persisted session payload carries filters + sort ONLY.
    act(() => {
      result.current.setColumnFilter("qty", ["100"]);
    });
    await waitFor(() => {
      const raw = window.sessionStorage.getItem("kapman_table_filters_executions");
      expect(raw).not.toBeNull();
      const parsed = JSON.parse(raw ?? "{}") as Record<string, unknown>;
      expect(parsed.filters).toEqual({ qty: ["100"] });
      expect("hiddenColumns" in parsed).toBe(false);
    });
  });

  it("two independently mounted tables patch only their own leaves", async () => {
    const settings = cloneDefaultProfile();
    settings.tables.hiddenColumns = { executions: ["fees"], positions: ["mark"] };
    stubFetch(settings);
    vi.useFakeTimers({ shouldAdvanceTime: true });

    const { result } = renderHook(
      () => ({
        executions: useDataTableState({ tableName: "executions", rows: [], columns: columns(["fees", "qty"]) }),
        positions: useDataTableState({ tableName: "positions", rows: [], columns: columns(["mark", "delta"]) }),
      }),
      { wrapper },
    );

    await waitFor(() => expect(result.current).not.toBeNull());
    expect(result.current.executions.hiddenColumns).toEqual(["fees"]);
    expect(result.current.positions.hiddenColumns).toEqual(["mark"]);

    act(() => {
      result.current.executions.setColumnVisibility("qty", false); // hide qty too
    });
    act(() => {
      result.current.positions.setColumnVisibility("mark", true); // unhide mark
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });

    expect(putCalls.length).toBe(1); // coalesced into one PUT …
    expect(putCalls[0].patch).toEqual({
      tables: {
        hiddenColumns: {
          executions: ["fees", "qty"], // … with each table's OWN leaf only
          positions: null, // empty -> delete, never touching the other table
        },
      },
    });
  });

  it("works without a ProfileProvider: in-memory visibility, session filters/sort", async () => {
    vi.stubGlobal("fetch", vi.fn());
    const { result } = renderHook(() =>
      useDataTableState({ tableName: "standalone", rows: [], columns: columns(["a", "b"]) }),
    );

    await waitFor(() => expect(result.current.isHydrated).toBe(true));
    expect(result.current.hiddenColumns).toEqual([]);

    act(() => {
      result.current.setColumnVisibility("a", false);
    });
    expect(result.current.hiddenColumns).toEqual(["a"]);
  });
});
