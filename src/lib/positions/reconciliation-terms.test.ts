import { describe, expect, it } from "vitest";
import { computeAccountReconciliationTerms, unexplainedDelta } from "./reconciliation-terms";
import type { ManualAdjustmentRecord } from "@/types/api";

const acatExecution = {
  id: "exec-acat",
  accountId: "fid",
  assetClass: "EQUITY",
  side: "BUY",
  quantity: "100",
  price: "89.81",
  rawRowJson: { action: "EXECUTION BUY OPEN EQUITY (ACAT_RECEIVE)", rawAction: "TRANSFER OF ASSETS ACAT RECEIVE (XLE)" },
};

describe("computeAccountReconciliationTerms", () => {
  it("closes the identity at zero when sweeps, reinvestments and an in-kind receive are classified like the value engine (#356, #357)", () => {
    // Stylized Fidelity ledger: cash starts at 0.04, a transfer, a sweep pair, a
    // dividend with its reinvestment leg, and shares received in kind that were
    // later sold at a loss.
    const cashRows = [
      { accountId: "fid", rowType: "TRANSFER_IN", amount: "10000" },
      { accountId: "fid", rowType: "MONEY_MARKET_BUY", amount: "-8000" },
      { accountId: "fid", rowType: "MONEY_MARKET_REDEEM", amount: "3000" },
      { accountId: "fid", rowType: "MONEY_MARKET_DIVIDEND", amount: "50" },
      { accountId: "fid", rowType: "MONEY_MARKET_DIVIDEND", amount: "-50" },
      { accountId: "fid", rowType: "ACAT_RECEIVE", amount: "20" },
    ];
    const terms = computeAccountReconciliationTerms({ accountIds: ["fid"], cashRows, executions: [acatExecution], adjustments: [] }).get("fid");
    expect(terms).toBeDefined();
    expect(terms?.cashAdjustments).toBeCloseTo(10000 + 50 + 20, 6);
    expect(terms?.inKindContributions).toBeCloseTo(8981, 6);

    // Value-engine cash = 0.04 + transfer + dividend + ACAT cash + sale proceeds (8542) with the in-kind buy cash-neutral.
    const cash = 0.04 + 10000 + 50 + 20 + 8542;
    const realized = 8542 - 8981; // shares received at 89.81 sold at 85.42
    const residual = unexplainedDelta({
      nlv: cash,
      startingCapital: 0.04,
      unrealizedPnl: 0,
      cashAdjustments: terms?.cashAdjustments ?? 0,
      inKindContributions: terms?.inKindContributions ?? 0,
      realizedPnl: realized,
      manualAdjustments: 0,
    });
    expect(residual).toBeCloseTo(0, 6);

    // The pre-fix raw sum would have left the sweep netting and the in-kind value unexplained.
    const rawSum = cashRows.reduce((sum, row) => sum + Number(row.amount), 0);
    expect(cash - 0.04 - rawSum - realized).toBeCloseTo(5000 + 50 + 8981, 6);
  });

  it("applies an active EXECUTION_PRICE_OVERRIDE to the in-kind basis", () => {
    const adjustments = [
      { id: "adj-1", status: "ACTIVE", adjustmentType: "EXECUTION_PRICE_OVERRIDE", payload: { executionId: "exec-acat", overridePrice: 85 } },
      { id: "adj-2", status: "REVERSED", adjustmentType: "EXECUTION_PRICE_OVERRIDE", payload: { executionId: "exec-acat", overridePrice: 1 } },
    ] as unknown as ManualAdjustmentRecord[];
    const terms = computeAccountReconciliationTerms({ accountIds: ["fid"], cashRows: [], executions: [acatExecution], adjustments }).get("fid");
    expect(terms?.inKindContributions).toBeCloseTo(8500, 6);
  });

  it("excludes a paper forex journal and keeps other accounts separate", () => {
    const cashRows = [
      { accountId: "p54", rowType: "FND", amount: "10000", description: "Initial forex money transfer." },
      { accountId: "p53", rowType: "FND", amount: "24761.54", description: "Position adjustment" },
    ];
    const terms = computeAccountReconciliationTerms({ accountIds: ["p53", "p54"], cashRows, executions: [], adjustments: [] });
    expect(terms.get("p54")?.cashAdjustments).toBe(0);
    expect(terms.get("p54")?.cashRowSummary.byClass.excluded_sub_account).toBe(10000);
    expect(terms.get("p53")?.cashAdjustments).toBeCloseTo(24761.54, 6);
  });
});
