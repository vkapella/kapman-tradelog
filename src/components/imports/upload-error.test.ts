import { describe, expect, it } from "vitest";
import { getUploadErrorMessage } from "./upload-error";

describe("getUploadErrorMessage", () => {
  it("shows actionable API parse details", () => {
    expect(
      getUploadErrorMessage({
        error: {
          code: "PARSE_ERROR",
          message: "Unable to parse uploaded file.",
          details: ["Unsupported Account Trade History header: missing required columns: Price."],
        },
      }),
    ).toBe(
      "Unable to parse uploaded file. Unsupported Account Trade History header: missing required columns: Price.",
    );
  });

  it("falls back when the server payload is not an API error", () => {
    expect(getUploadErrorMessage({ unexpected: true })).toBe("Upload failed. Review the file and retry.");
  });
});
