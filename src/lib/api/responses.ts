import { NextResponse } from "next/server";
import type { ApiDetailResponse, ApiErrorResponse, ApiListMeta, ApiListResponse } from "@/types/api";

export function listResponse<T>(data: T[], meta: ApiListMeta) {
  const body: ApiListResponse<T> = { data, meta };
  return NextResponse.json(body);
}

export function detailResponse<T>(data: T) {
  const body: ApiDetailResponse<T> = { data };
  return NextResponse.json(body);
}

export function errorResponse(code: string, message: string, details: string[], status = 400) {
  const body: ApiErrorResponse = {
    error: {
      code,
      message,
      details,
    },
  };

  return NextResponse.json(body, { status });
}

export function parsePagination(searchParams: URLSearchParams) {
  const page = Number(searchParams.get("page") ?? "1");
  const pageSize = Number(searchParams.get("pageSize") ?? "25");

  return {
    page: Number.isFinite(page) && page > 0 ? page : 1,
    pageSize: Number.isFinite(pageSize) && pageSize > 0 ? pageSize : 25,
  };
}
