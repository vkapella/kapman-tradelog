import { describe, expect, it } from "vitest";
import { parseAccountMetadataFromCsv } from "./parse-account-metadata";

describe("parseAccountMetadataFromCsv", () => {
  it("parses account id and paper money metadata", () => {
    const csv = [
      "This document was exported from the paperMoney platform.",
      "",
      "Account Statement for D-68011053 (margin) since 8/15/25 through 4/6/26",
    ].join("\n");

    const result = parseAccountMetadataFromCsv(csv);

    expect(result.accountId).toBe("D-68011053");
    expect(result.paperMoney).toBe(true);
    expect(result.broker).toBe("SCHWAB_THINKORSWIM");
  });
});
