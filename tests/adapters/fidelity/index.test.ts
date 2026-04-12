import { describe, expect, it } from "vitest";
import { FidelityAdapter } from "@/lib/adapters/fidelity/index";
import { FIXTURE_ACCOUNT_ID, FIXTURE_FILENAME_10, loadFixtureBuffer } from "./fixture-data";

describe("FidelityAdapter", () => {
  it("parses fixture buffers without throwing", () => {
    const adapter = new FidelityAdapter();
    const buffer = loadFixtureBuffer(FIXTURE_FILENAME_10);

    const parsed = adapter.parse(buffer, FIXTURE_FILENAME_10);

    expect(parsed.records.length).toBeGreaterThan(0);
    expect(parsed.accountId).toBe(FIXTURE_ACCOUNT_ID);
  });

  it("validates status counts and warning message conversion", () => {
    const adapter = new FidelityAdapter();
    const buffer = loadFixtureBuffer(FIXTURE_FILENAME_10);
    const parsed = adapter.parse(buffer, FIXTURE_FILENAME_10);

    const validation = adapter.validate(parsed.records);

    expect(validation.total).toBe(parsed.records.length);
    expect(validation.byStatus.VALID + validation.byStatus.WARNING + validation.byStatus.SKIPPED + validation.byStatus.CANCELLED).toBe(
      parsed.records.length,
    );

    const messages = adapter.warningsToMessages([{ rowIndex: 99, rawAction: "X", message: "Test warning" }]);
    expect(messages).toEqual(["Row 99: Test warning"]);
  });
});
