// @vitest-environment jsdom
// #344: ProfileProvider + AccountFilterContextProvider — the two-stage
// hydration barrier, desired-vs-applied account separation, the fallback
// chain, identity-change handling, journal restore, and reset scope.

import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AccountFilterContextProvider, useAccountFilterContext } from "@/contexts/AccountFilterContext";
import { ProfileProvider, useProfileContext, type ProfileContextValue } from "@/contexts/ProfileContext";
import { cloneDefaultProfile } from "@/lib/profile/schema";
import type { ProfileSettingsV1 } from "@/types/api";

const hydrateSpy = vi.hoisted(() => vi.fn());
vi.mock("@/store/openPositionsStore", () => ({
  openPositionsStore: { hydrate: hydrateSpy },
}));

const VICTOR = "victor.kapella@kapmancapital.com";

interface StubResponse {
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
}

function jsonResponse(body: unknown, status = 200): StubResponse {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

function profileGetBody(settings: ProfileSettingsV1, overrides: Record<string, unknown> = {}) {
  return {
    data: {
      email: VICTOR,
      settings,
      isDefault: false,
      writable: true,
      revision: "1",
      updatedAt: "2026-08-29T00:00:00.000Z",
      ...overrides,
    },
  };
}

function accountRow(id: string, externalId: string) {
  return {
    id,
    accountId: externalId,
    displayLabel: null,
    brokerName: null,
    startingCapital: null,
    paperMoney: false,
    legalEntity: null,
    createdAt: "2026-01-01T00:00:00.000Z",
  };
}

function accountsBody(rows: ReturnType<typeof accountRow>[]) {
  return { data: rows, meta: { total: rows.length, page: 1, pageSize: rows.length } };
}

const state = {
  profileGet: null as (() => StubResponse | Promise<StubResponse>) | null,
  accountsGet: null as (() => StubResponse | Promise<StubResponse>) | null,
  putCalls: [] as Array<{ body: { patch: unknown }; headers: Record<string, string> }>,
  putResult: (): StubResponse =>
    jsonResponse({ data: { settings: cloneDefaultProfile(), revision: "2", updatedAt: "2026-08-29T00:00:01.000Z" } }),
};

const captured: { profile?: ProfileContextValue; accounts?: ReturnType<typeof useAccountFilterContext> } = {};

function Probe() {
  captured.profile = useProfileContext();
  captured.accounts = useAccountFilterContext();
  return <div data-testid="probe">{captured.accounts.selectedAccounts.join(",")}</div>;
}

function DataFetcher() {
  // Stands in for any scope-sensitive page: fetches the moment it mounts.
  const { selectedAccounts } = useAccountFilterContext();
  void fetch(`/api/overview/summary?accountIds=${selectedAccounts.join(",")}`);
  return null;
}

function mountApp(children: React.ReactNode = <Probe />) {
  return render(
    <ProfileProvider identity={VICTOR}>
      <AccountFilterContextProvider>{children}</AccountFilterContextProvider>
    </ProfileProvider>,
  );
}

const dataFetchUrls: string[] = [];

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: unknown, init?: { method?: string; body?: string; headers?: Record<string, string> }) => {
      const u = String(url);
      if (u.startsWith("/api/profile")) {
        if (init?.method === "PUT") {
          state.putCalls.push({ body: JSON.parse(init.body ?? "{}") as { patch: unknown }, headers: init.headers ?? {} });
          return state.putResult();
        }
        return state.profileGet ? state.profileGet() : jsonResponse({}, 500);
      }
      if (u.startsWith("/api/accounts")) {
        return state.accountsGet ? state.accountsGet() : jsonResponse({}, 500);
      }
      dataFetchUrls.push(u);
      return jsonResponse({ data: {} });
    }),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  vi.useRealTimers();
  window.localStorage.clear();
  state.profileGet = null;
  state.accountsGet = null;
  state.putCalls = [];
  dataFetchUrls.length = 0;
  delete captured.profile;
  delete captured.accounts;
});

describe("two-stage hydration barrier", () => {
  it("withholds data-fetching descendants and positions hydration until both stages, then applies the reconciled scope", async () => {
    let releaseProfile: (value: StubResponse) => void = () => undefined;
    let releaseAccounts: (value: StubResponse) => void = () => undefined;
    state.profileGet = () => new Promise<StubResponse>((resolve) => { releaseProfile = resolve; });
    state.accountsGet = () => new Promise<StubResponse>((resolve) => { releaseAccounts = resolve; });

    const settings = cloneDefaultProfile();
    settings.accounts.selected = ["18528700SCHW", "STALE9999"];

    mountApp(
      <>
        <Probe />
        <DataFetcher />
      </>,
    );

    // Stage 1 pending: nothing beneath mounts, nothing fetches data.
    expect(screen.queryByTestId("probe")).toBeNull();
    expect(dataFetchUrls).toEqual([]);
    expect(hydrateSpy).not.toHaveBeenCalled();

    await act(async () => {
      releaseProfile(jsonResponse(profileGetBody(settings)));
    });

    // Stage 2 pending: still withheld.
    expect(screen.queryByTestId("probe")).toBeNull();
    expect(dataFetchUrls).toEqual([]);

    await act(async () => {
      releaseAccounts(jsonResponse(accountsBody([accountRow("cuid-1", "18528700SCHW"), accountRow("cuid-2", "OTHER1")])));
    });

    await waitFor(() => expect(screen.getByTestId("probe")).toBeDefined());

    // Applied selection: the resolved internal id only; the stale id dropped
    // from the APPLIED selection but retained in the desired EXTERNAL ids.
    expect(captured.accounts?.selectedAccounts).toEqual(["cuid-1"]);
    expect(captured.profile?.accountsSelected).toEqual(["18528700SCHW", "STALE9999"]);

    // Data fetches ran at the applied scope — never empty/all-accounts.
    expect(dataFetchUrls.every((u) => u.includes("accountIds=cuid-1"))).toBe(true);
    expect(hydrateSpy).toHaveBeenCalledWith(["cuid-1"]);

    // Zero PUTs from hydration/reconciliation.
    expect(state.putCalls).toEqual([]);
  });

  it("none of the desired ids resolve: all-accounts runtime fallback, desired selection untouched, nothing dirtied", async () => {
    const settings = cloneDefaultProfile();
    settings.accounts.selected = ["GONE1", "GONE2"];
    state.profileGet = () => jsonResponse(profileGetBody(settings));
    state.accountsGet = () => jsonResponse(accountsBody([accountRow("cuid-1", "A1"), accountRow("cuid-2", "A2")]));

    vi.useFakeTimers({ shouldAdvanceTime: true });
    mountApp();
    await waitFor(() => expect(screen.getByTestId("probe")).toBeDefined());

    expect(captured.accounts?.selectedAccounts).toEqual(["cuid-1", "cuid-2"]);
    expect(captured.profile?.accountsSelected).toEqual(["GONE1", "GONE2"]);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });
    expect(state.putCalls).toEqual([]); // the fallback is NOT a user edit
  });

  it("accounts-fetch error keeps the barrier CLOSED behind a Retry; a later success opens it", async () => {
    state.profileGet = () => jsonResponse(profileGetBody(cloneDefaultProfile()));
    let failFirst = true;
    state.accountsGet = () => {
      if (failFirst) {
        failFirst = false;
        return jsonResponse({}, 500);
      }
      return jsonResponse(accountsBody([accountRow("cuid-1", "18528700SCHW")]));
    };

    mountApp(
      <>
        <Probe />
        <DataFetcher />
      </>,
    );

    const retry = await screen.findByRole("button", { name: "Retry" });
    expect(screen.queryByTestId("probe")).toBeNull();
    expect(dataFetchUrls).toEqual([]);
    expect(hydrateSpy).not.toHaveBeenCalled();

    await act(async () => {
      retry.click();
    });

    await waitFor(() => expect(screen.getByTestId("probe")).toBeDefined());
    expect(captured.accounts?.selectedAccounts).toEqual(["cuid-1"]);
  });

  it("a SUCCESSFUL zero-account response opens the barrier without hydrating positions", async () => {
    state.profileGet = () => jsonResponse(profileGetBody(cloneDefaultProfile()));
    state.accountsGet = () => jsonResponse(accountsBody([]));

    mountApp();
    await waitFor(() => expect(screen.getByTestId("probe")).toBeDefined());
    expect(captured.accounts?.selectedAccounts).toEqual([]);
    expect(hydrateSpy).not.toHaveBeenCalled();
  });
});

describe("fallback chain and identity safety", () => {
  it("GET failure: same-identity cache is used, including its writable=false state (autosave stays off)", async () => {
    const cachedSettings = cloneDefaultProfile();
    cachedSettings.dashboard.kpis = ["realized-pnl"];
    window.localStorage.setItem(
      `kapman-tradelog.profile-cache.v1.${VICTOR}`,
      JSON.stringify({
        cacheVersion: 1,
        identity: VICTOR,
        writable: false,
        revision: "4",
        updatedAt: null,
        settings: cachedSettings,
        cachedAt: "2026-08-28T00:00:00.000Z",
      }),
    );
    state.profileGet = () => jsonResponse({}, 500);
    state.accountsGet = () => jsonResponse(accountsBody([accountRow("cuid-1", "18528700SCHW")]));

    vi.useFakeTimers({ shouldAdvanceTime: true });
    mountApp();
    await waitFor(() => expect(screen.getByTestId("probe")).toBeDefined());

    expect(captured.profile?.kpis).toEqual(["realized-pnl"]);
    expect(captured.profile?.writable).toBe(false);

    // writable=false from the cache keeps autosave disabled.
    act(() => {
      captured.profile?.reportKpis(["realized-pnl", "setup-count"]);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    expect(state.putCalls).toEqual([]);
  });

  it("a different-identity cache is never used: defaults instead", async () => {
    const ronSettings = cloneDefaultProfile();
    ronSettings.dashboard.kpis = ["setup-count"];
    window.localStorage.setItem(
      "kapman-tradelog.profile-cache.v1.ron.nyman@kapmancapital.com",
      JSON.stringify({
        cacheVersion: 1,
        identity: "ron.nyman@kapmancapital.com",
        writable: true,
        revision: "1",
        updatedAt: null,
        settings: ronSettings,
        cachedAt: "2026-08-28T00:00:00.000Z",
      }),
    );
    state.profileGet = () => jsonResponse({}, 500);
    state.accountsGet = () => jsonResponse(accountsBody([accountRow("cuid-1", "18528700SCHW")]));

    mountApp();
    await waitFor(() => expect(screen.getByTestId("probe")).toBeDefined());
    expect(captured.profile?.kpis).toBeNull(); // defaults, not Ron's cache
  });

  it("IDENTITY_CHANGED on the bootstrap GET forces a reload", async () => {
    const reload = vi.fn();
    const originalLocation = window.location;
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { ...originalLocation, reload },
    });

    state.profileGet = () => jsonResponse({ error: { code: "IDENTITY_CHANGED", message: "", details: [] } }, 409);
    state.accountsGet = () => jsonResponse(accountsBody([]));

    mountApp();
    await waitFor(() => expect(reload).toHaveBeenCalledTimes(1));
    expect(screen.queryByTestId("probe")).toBeNull();

    Object.defineProperty(window, "location", { configurable: true, value: originalLocation });
  });

  it("legacy per-setting localStorage keys are deleted on first load", async () => {
    window.localStorage.setItem("kapman-tradelog.selected-accounts.v1", "[]");
    window.localStorage.setItem("kapman_range_filter", "{}");
    window.localStorage.setItem("kapman_dashboard_layout", "[]");
    window.localStorage.setItem("kapman_kpi_layout", "[]");
    state.profileGet = () => jsonResponse(profileGetBody(cloneDefaultProfile()));
    state.accountsGet = () => jsonResponse(accountsBody([]));

    mountApp();
    await waitFor(() => expect(screen.getByTestId("probe")).toBeDefined());
    expect(window.localStorage.getItem("kapman-tradelog.selected-accounts.v1")).toBeNull();
    expect(window.localStorage.getItem("kapman_range_filter")).toBeNull();
    expect(window.localStorage.getItem("kapman_dashboard_layout")).toBeNull();
    expect(window.localStorage.getItem("kapman_kpi_layout")).toBeNull();
  });
});

describe("journal restore", () => {
  function seedJournal(entries: Record<string, unknown>) {
    window.localStorage.setItem(
      `kapman-tradelog.profile-pending.v1.${VICTOR}`,
      JSON.stringify({ journalVersion: 1, identity: VICTOR, entries }),
    );
  }

  it("fresh GET already equals the journaled value: cleared WITHOUT a redundant PUT", async () => {
    const settings = cloneDefaultProfile();
    settings.dashboard.kpis = ["realized-pnl"];
    seedJournal({
      "dashboard.kpis": { value: ["realized-pnl"], gen: 3, mustConfirm: true, editedAt: "" },
    });
    state.profileGet = () => jsonResponse(profileGetBody(settings));
    state.accountsGet = () => jsonResponse(accountsBody([]));

    vi.useFakeTimers({ shouldAdvanceTime: true });
    mountApp();
    await waitFor(() => expect(screen.getByTestId("probe")).toBeDefined());

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    expect(state.putCalls).toEqual([]);
    expect(window.localStorage.getItem(`kapman-tradelog.profile-pending.v1.${VICTOR}`)).toBeNull();
  });

  it("fresh GET differs: the journaled desired value is sent", async () => {
    seedJournal({
      "dashboard.kpis": { value: ["setup-count"], gen: 3, mustConfirm: false, editedAt: "" },
    });
    state.profileGet = () => jsonResponse(profileGetBody(cloneDefaultProfile()));
    state.accountsGet = () => jsonResponse(accountsBody([]));

    vi.useFakeTimers({ shouldAdvanceTime: true });
    mountApp();
    await waitFor(() => expect(screen.getByTestId("probe")).toBeDefined());

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });
    expect(state.putCalls.length).toBe(1);
    expect(state.putCalls[0].body.patch).toEqual({ dashboard: { kpis: ["setup-count"] } });
    expect(state.putCalls[0].headers["x-kapman-expected-user"]).toBe(VICTOR);
  });

  it("a journal is DISCARDED when the session is read-only (writable=false)", async () => {
    seedJournal({
      "dashboard.kpis": { value: ["setup-count"], gen: 3, mustConfirm: false, editedAt: "" },
    });
    state.profileGet = () => jsonResponse(profileGetBody(cloneDefaultProfile(), { writable: false, isDefault: true }));
    state.accountsGet = () => jsonResponse(accountsBody([]));

    vi.useFakeTimers({ shouldAdvanceTime: true });
    mountApp();
    await waitFor(() => expect(screen.getByTestId("probe")).toBeDefined());

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    expect(state.putCalls).toEqual([]);
    expect(window.localStorage.getItem(`kapman-tradelog.profile-pending.v1.${VICTOR}`)).toBeNull();
  });
});

describe("user edits and reset", () => {
  it("a user account selection reports EXTERNAL ids and autosaves", async () => {
    state.profileGet = () => jsonResponse(profileGetBody(cloneDefaultProfile()));
    state.accountsGet = () => jsonResponse(accountsBody([accountRow("cuid-1", "18528700SCHW"), accountRow("cuid-2", "OTHER1")]));

    vi.useFakeTimers({ shouldAdvanceTime: true });
    mountApp();
    await waitFor(() => expect(screen.getByTestId("probe")).toBeDefined());

    act(() => {
      captured.accounts?.setSelectedAccounts(["cuid-2"]);
    });
    expect(captured.profile?.accountsSelected).toEqual(["OTHER1"]);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    expect(state.putCalls.length).toBe(1);
    expect(state.putCalls[0].body.patch).toEqual({ accounts: { selected: ["OTHER1"] } });
  });

  it("reset deletes EVERY stored table-visibility leaf, including unmounted tables", async () => {
    const settings = cloneDefaultProfile();
    settings.dashboard = { widgets: [{ widgetId: "equity-curve", colSpan: 2 }], kpis: ["realized-pnl"] };
    settings.tables.hiddenColumns = { executions: ["fees"], positions: ["mark"], setups: ["tag"] };
    state.profileGet = () => jsonResponse(profileGetBody(settings));
    state.accountsGet = () => jsonResponse(accountsBody([accountRow("cuid-1", "18528700SCHW")]));

    vi.useFakeTimers({ shouldAdvanceTime: true });
    mountApp(); // note: NO tables are mounted anywhere in this tree
    await waitFor(() => expect(screen.getByTestId("probe")).toBeDefined());

    act(() => {
      captured.profile?.resetToDefaults();
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    expect(state.putCalls.length).toBe(1);
    const patch = state.putCalls[0].body.patch as {
      tables?: { hiddenColumns: Record<string, unknown> };
      dashboard?: { widgets?: unknown; kpis?: unknown };
    };
    expect(patch.tables?.hiddenColumns).toEqual({ executions: null, positions: null, setups: null });
    expect(patch.dashboard).toEqual({ widgets: null, kpis: null });
    expect(captured.profile?.hiddenColumns).toEqual({});
  });
});
