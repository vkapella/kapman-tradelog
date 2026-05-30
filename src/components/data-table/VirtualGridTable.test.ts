import { describe, expect, it } from "vitest";
import { shouldRenderPlainVirtualGridRows } from "@/components/data-table/VirtualGridTable";

describe("shouldRenderPlainVirtualGridRows", () => {
  it("renders normal rows for typical table sizes", () => {
    expect(shouldRenderPlainVirtualGridRows(429, 12)).toBe(true);
  });

  it("falls back to normal rows when virtualization reports no visible items", () => {
    expect(shouldRenderPlainVirtualGridRows(1500, 0)).toBe(true);
  });

  it("keeps virtualization for large tables with visible virtual items", () => {
    expect(shouldRenderPlainVirtualGridRows(1500, 12)).toBe(false);
  });

  it("does not render fallback rows for empty tables", () => {
    expect(shouldRenderPlainVirtualGridRows(0, 0)).toBe(false);
  });
});
