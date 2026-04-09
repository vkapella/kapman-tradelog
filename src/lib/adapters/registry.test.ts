import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { detectAdapter, listAdapters } from "./registry";

describe("adapter registry", () => {
  it("lists schwab active adapter and fidelity stub", () => {
    const adapters = listAdapters();
    expect(adapters.map((adapter) => adapter.id)).toEqual(["schwab_thinkorswim", "fidelity"]);
    expect(adapters[0]?.status).toBe("active");
    expect(adapters[1]?.status).toBe("stub");
  });

  it("detects thinkorswim fixtures through registry selection", () => {
    const fixture = readFileSync("fixtures/2026-04-06-AccountStatement.csv", "utf8");

    const match = detectAdapter({
      name: "2026-04-06-AccountStatement.csv",
      content: fixture,
      mimeType: "text/csv",
      size: fixture.length,
    });

    expect(match?.adapter.id).toBe("schwab_thinkorswim");
    expect(match?.detection.matched).toBe(true);
  });
});
