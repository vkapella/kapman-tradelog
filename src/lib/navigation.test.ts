import { describe, expect, it } from "vitest";
import { BOTTOM_TABS, resolveActiveTab } from "@/lib/navigation";

describe("resolveActiveTab", () => {
  it("exposes exactly the five approved tab destinations in the fixed order", () => {
    expect(BOTTOM_TABS.map((tab) => tab.href)).toEqual(["/dashboard", "/today", "/positions", "/recommendations", "/analytics"]);
  });

  it("maps the root path to /dashboard (universal landing page)", () => {
    expect(resolveActiveTab("/")).toBe("/dashboard");
    expect(resolveActiveTab("")).toBe("/dashboard");
  });

  it("matches exact and nested tab routes", () => {
    expect(resolveActiveTab("/positions")).toBe("/positions");
    expect(resolveActiveTab("/recommendations")).toBe("/recommendations");
    expect(resolveActiveTab("/analytics")).toBe("/analytics");
    expect(resolveActiveTab("/today")).toBe("/today");
  });

  it("returns null for drawer-only destinations", () => {
    for (const path of ["/trade-records", "/imports", "/accounts", "/adjustments", "/tts-evidence", "/diagnostics"]) {
      expect(resolveActiveTab(path)).toBeNull();
    }
  });

  it("does not prefix-match unrelated routes", () => {
    expect(resolveActiveTab("/positionsX")).toBeNull();
  });
});
