import type { ApiErrorResponse } from "@/types/api";

export function getUploadErrorMessage(payload: unknown): string {
  if (!payload || typeof payload !== "object" || !("error" in payload)) {
    return "Upload failed. Review the file and retry.";
  }

  const error = (payload as Partial<ApiErrorResponse>).error;
  if (!error || typeof error.message !== "string") {
    return "Upload failed. Review the file and retry.";
  }

  const details = Array.isArray(error.details)
    ? error.details.filter((detail): detail is string => typeof detail === "string" && detail.trim().length > 0)
    : [];

  return details.length > 0 ? `${error.message} ${details.join(" ")}` : error.message;
}
