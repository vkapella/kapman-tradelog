import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { FidelityAdapter } from "@/lib/adapters/fidelity/index";

describe("FidelityAdapter", () => {
  it("parses fixture buffers without throwing", () => {
    const adapter = new FidelityAdapter();
    const buffer = readFileSync("tests/adapters/fidelity/fixtures/History_for_Account_X19467537-10.csv");

    const parsed = adapter.parse(buffer, "History_for_Account_X19467537-10.csv");

    expect(parsed.records.length).toBeGreaterThan(0);
    expect(parsed.accountId).toBe("X19467537");
  });

  it("validates status counts and warning message conversion", () => {
    const adapter = new FidelityAdapter();
    const buffer = readFileSync("tests/adapters/fidelity/fixtures/History_for_Account_X19467537-10.csv");
    const parsed = adapter.parse(buffer, "History_for_Account_X19467537-10.csv");

    const validation = adapter.validate(parsed.records);

    expect(validation.total).toBe(parsed.records.length);
    expect(validation.byStatus.VALID + validation.byStatus.WARNING + validation.byStatus.SKIPPED + validation.byStatus.CANCELLED).toBe(
      parsed.records.length,
    );

    const messages = adapter.warningsToMessages([{ rowIndex: 99, rawAction: "X", message: "Test warning" }]);
    expect(messages).toEqual(["Row 99: Test warning"]);
  });
});
