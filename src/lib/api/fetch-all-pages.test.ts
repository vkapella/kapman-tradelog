import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchAllPages } from "./fetch-all-pages";

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

describe("fetchAllPages", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("fetches every page using response pagination metadata and no-store requests", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(jsonResponse({
        data: [{ id: "row-1" }, { id: "row-2" }],
        meta: { total: 5, page: 1, pageSize: 2 },
      }))
      .mockResolvedValueOnce(jsonResponse({
        data: [{ id: "row-3" }, { id: "row-4" }],
        meta: { total: 5, page: 2, pageSize: 2 },
      }))
      .mockResolvedValueOnce(jsonResponse({
        data: [{ id: "row-5" }],
        meta: { total: 5, page: 3, pageSize: 2 },
      }));
    const params = new URLSearchParams("accountIds=A1&startDate=2026-01-01");

    const payload = await fetchAllPages<{ id: string }>("/api/analysis/excursions", params, 2);

    expect(payload).toEqual({
      data: [{ id: "row-1" }, { id: "row-2" }, { id: "row-3" }, { id: "row-4" }, { id: "row-5" }],
      meta: { total: 5, page: 1, pageSize: 5 },
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock).toHaveBeenNthCalledWith(1, "/api/analysis/excursions?accountIds=A1&startDate=2026-01-01&page=1&pageSize=2", { cache: "no-store" });
    expect(fetchMock).toHaveBeenNthCalledWith(2, "/api/analysis/excursions?accountIds=A1&startDate=2026-01-01&page=2&pageSize=2", { cache: "no-store" });
    expect(fetchMock).toHaveBeenNthCalledWith(3, "/api/analysis/excursions?accountIds=A1&startDate=2026-01-01&page=3&pageSize=2", { cache: "no-store" });
    expect(params.toString()).toBe("accountIds=A1&startDate=2026-01-01");
  });
});
