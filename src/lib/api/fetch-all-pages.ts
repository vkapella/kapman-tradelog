import type { ApiListResponse } from "@/types/api";

export async function fetchAllPages<T>(path: string, searchParams: URLSearchParams, pageSize = 250): Promise<ApiListResponse<T>> {
  const firstParams = new URLSearchParams(searchParams);
  firstParams.set("page", "1");
  firstParams.set("pageSize", String(pageSize));

  const firstResponse = await fetch(`${path}?${firstParams.toString()}`, { cache: "no-store" });
  if (!firstResponse.ok) {
    throw new Error(`Unable to load ${path}`);
  }

  const firstPayload = (await firstResponse.json()) as ApiListResponse<T>;
  const totalPages = Math.max(1, Math.ceil(firstPayload.meta.total / firstPayload.meta.pageSize));

  if (totalPages === 1) {
    return firstPayload;
  }

  const remainingPayloads = await Promise.all(
    Array.from({ length: totalPages - 1 }, async (_, index) => {
      const page = index + 2;
      const nextParams = new URLSearchParams(searchParams);
      nextParams.set("page", String(page));
      nextParams.set("pageSize", String(pageSize));
      const response = await fetch(`${path}?${nextParams.toString()}`, { cache: "no-store" });
      if (!response.ok) {
        throw new Error(`Unable to load ${path} page ${page}`);
      }
      return (await response.json()) as ApiListResponse<T>;
    }),
  );

  return {
    data: [firstPayload.data, ...remainingPayloads.map((payload) => payload.data)].flat(),
    meta: {
      total: firstPayload.meta.total,
      page: 1,
      pageSize: firstPayload.meta.total,
    },
  };
}
