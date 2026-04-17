import { describe, expect, it } from "vitest";
import { fidelityAdapter } from "@/lib/adapters/fidelity";
import type { UploadedFile } from "@/lib/adapters/types";
import { FIXTURE_ACCOUNT_ID, FIXTURE_FILENAME_11, loadFixtureCsvText } from "./fixture-data";

const HEADER =
  "Run Date,Action,Symbol,Description,Type,Price ($),Quantity,Commission ($),Fees ($),Accrued Interest ($),Amount ($),Cash Balance ($),Settlement Date";

function makeFile(rows: string[]): UploadedFile {
  return {
    name: `History_for_Account_${FIXTURE_ACCOUNT_ID}-11.csv`,
    mimeType: "text/csv",
    size: 0,
    content: ["History for Account", "Generated for tests", HEADER, ...rows].join("\n"),
  };
}

describe("fidelityAdapter.parse", () => {
  it("does not treat BUY/SELL CANCEL rows as unsupported when a cancel/correct triplet is collapsed", () => {
    const file = makeFile([
      "1/2/2025,YOU BOUGHT CLOSING TRANSACTION,-INTC250117C23,CALL INTC JAN 17 25 $23,Margin,0.11,1,0,0,,-11.12,1000,1/3/2025",
      "1/21/2025,BUY CANCEL CLOSING TRANSACTION,-INTC250117C23,CXL DESCRIPTION CANCELLED TRADE as of Jan-02-2025,Margin,0.11,-1,0,0,,11.12,1011.12,1/3/2025",
      "1/21/2025,YOU BOUGHT CLOSING TRANSACTION,-INTC250117C23,CORR DESCRIPTION CORRECTED CONFIRM as of Jan-02-2025,Margin,0.11,1,0,0,,-11.03,1000.09,1/3/2025",
    ]);

    const parsed = fidelityAdapter.parse(file);

    expect(parsed.skippedRows).toBe(0);
    expect(parsed.executions).toHaveLength(1);
    expect(parsed.executions[0]?.rawRowJson.cancelRebookCode).toBe("CANCEL_REBOOK");
    expect(parsed.warnings.some((warning) => warning.code === "CANCEL_REBOOK")).toBe(true);
    expect(parsed.warnings.some((warning) => warning.message.includes("Cancelled row skipped"))).toBe(false);
  });

  it("ignores Fidelity trailer text instead of surfacing it as skipped preview rows", () => {
    const file: UploadedFile = {
      name: FIXTURE_FILENAME_11,
      mimeType: "text/csv",
      size: 0,
      content: loadFixtureCsvText(FIXTURE_FILENAME_11),
    };

    const parsed = fidelityAdapter.parse(file);
    const fidelityPreviewRows = (parsed.previewRows ?? []) as Array<{ rowIndex: number }>;

    expect(parsed.parsedRows).toBe(3);
    expect(fidelityPreviewRows).toHaveLength(3);
    expect(fidelityPreviewRows.every((row) => row.rowIndex <= 6)).toBe(true);
    expect(parsed.skippedRows).toBe(0);
  });
});
