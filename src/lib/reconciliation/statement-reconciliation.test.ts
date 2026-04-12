import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_RECONCILIATION_TOLERANCE,
  runStatementReconciliationSuite,
  type DashboardReconciliationSnapshot,
  type StatementSnapshotReference,
} from "./statement-reconciliation";

interface ReferenceFixture {
  statementDate: string;
  accounts: Array<{
    accountExternalId: string;
    totalCash: number;
    netLiquidatingValue: number;
    impliedOpenPositionValue: number;
    equityLineItemCount: number;
    optionLineItemCount: number;
  }>;
}

function loadStatementReferences(): StatementSnapshotReference[] {
  const fixture = JSON.parse(
    readFileSync("fixtures/reconciliation/2026-04-09-reference.json", "utf8"),
  ) as ReferenceFixture;

  return fixture.accounts.map((account) => ({
    accountExternalId: account.accountExternalId,
    statementDate: fixture.statementDate,
    totalCash: account.totalCash,
    netLiquidatingValue: account.netLiquidatingValue,
    impliedOpenPositionValue: account.impliedOpenPositionValue,
    equityLineItemCount: account.equityLineItemCount,
    optionLineItemCount: account.optionLineItemCount,
  }));
}

describe("runStatementReconciliationSuite", () => {
  it("surfaces line-level discrepancies with configured tolerance checks for both 2026-04-09 statement accounts", () => {
    const references = loadStatementReferences();
    const dashboardSnapshots: DashboardReconciliationSnapshot[] = [
      {
        accountExternalId: "D-68011053",
        statementDate: "2026-04-09",
        totalCash: 85029.22,
        netLiquidatingValue: 206565.29,
        impliedOpenPositionValue: 121536.07,
        equityLineItemCount: 4,
        optionLineItemCount: 14,
      },
      {
        accountExternalId: "D-68011054",
        statementDate: "2026-04-09",
        totalCash: 42776.8,
        netLiquidatingValue: 90400.11,
        impliedOpenPositionValue: 47623.31,
        equityLineItemCount: 2,
        optionLineItemCount: 2,
      },
    ];

    const result = runStatementReconciliationSuite(references, dashboardSnapshots, DEFAULT_RECONCILIATION_TOLERANCE);
    const account53 = result.results.find((entry) => entry.accountExternalId === "D-68011053");
    const account54 = result.results.find((entry) => entry.accountExternalId === "D-68011054");

    expect(result.passed).toBe(false);
    expect(account53?.passed).toBe(false);
    expect(account53?.discrepancies).toHaveLength(3);
    expect(account53?.discrepancies[0]).toContain("Cash reconciliation failed");
    expect(account53?.discrepancies[1]).toContain("NLV reconciliation failed");
    expect(account53?.discrepancies[2]).toContain("Open-position value reconciliation failed");

    expect(account54?.passed).toBe(true);
    expect(account54?.discrepancies).toHaveLength(0);
  });

  it("uses configurable tolerance thresholds", () => {
    const references = loadStatementReferences();
    const dashboardSnapshots: DashboardReconciliationSnapshot[] = references.map((reference) => ({
      accountExternalId: reference.accountExternalId,
      statementDate: reference.statementDate,
      totalCash: reference.totalCash + 5,
      netLiquidatingValue: reference.netLiquidatingValue + 250,
      impliedOpenPositionValue: reference.impliedOpenPositionValue + 250,
      equityLineItemCount: reference.equityLineItemCount,
      optionLineItemCount: reference.optionLineItemCount,
    }));

    const strict = runStatementReconciliationSuite(references, dashboardSnapshots, {
      cash: 1,
      nlv: 500,
      openPositionValue: 500,
      lineItemCount: 0,
    });
    const relaxed = runStatementReconciliationSuite(references, dashboardSnapshots, {
      cash: 10,
      nlv: 500,
      openPositionValue: 500,
      lineItemCount: 0,
    });

    expect(strict.passed).toBe(false);
    expect(strict.discrepancies.some((line) => line.includes("Cash reconciliation failed"))).toBe(true);
    expect(relaxed.passed).toBe(true);
    expect(relaxed.discrepancies).toHaveLength(0);
  });
});
