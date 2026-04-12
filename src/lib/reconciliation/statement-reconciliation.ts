export interface ReconciliationToleranceConfig {
  cash: number;
  nlv: number;
  openPositionValue: number;
  lineItemCount: number;
}

export interface StatementSnapshotReference {
  accountExternalId: string;
  statementDate: string;
  totalCash: number;
  netLiquidatingValue: number;
  impliedOpenPositionValue: number;
  equityLineItemCount: number;
  optionLineItemCount: number;
}

export interface DashboardReconciliationSnapshot {
  accountExternalId: string;
  statementDate: string;
  totalCash: number;
  netLiquidatingValue: number;
  impliedOpenPositionValue: number;
  equityLineItemCount: number;
  optionLineItemCount: number;
}

export interface ReconciliationCheckResult {
  metric:
    | "cash"
    | "nlv"
    | "openPositionValue"
    | "equityLineItemCount"
    | "optionLineItemCount";
  expected: number;
  actual: number;
  delta: number;
  tolerance: number;
  passed: boolean;
}

export interface AccountReconciliationResult {
  accountExternalId: string;
  statementDate: string;
  passed: boolean;
  checks: ReconciliationCheckResult[];
  discrepancies: string[];
}

export interface ReconciliationSuiteResult {
  passed: boolean;
  results: AccountReconciliationResult[];
  discrepancies: string[];
}

export const DEFAULT_RECONCILIATION_TOLERANCE: ReconciliationToleranceConfig = {
  cash: 1,
  nlv: 500,
  openPositionValue: 500,
  lineItemCount: 0,
};

function roundMoney(value: number): number {
  return Number(value.toFixed(2));
}

function buildCheck(
  metric: ReconciliationCheckResult["metric"],
  expected: number,
  actual: number,
  tolerance: number,
): ReconciliationCheckResult {
  const delta = roundMoney(actual - expected);
  const passed = Math.abs(delta) <= tolerance;

  return {
    metric,
    expected,
    actual,
    delta,
    tolerance,
    passed,
  };
}

function toDiscrepancyLine(accountExternalId: string, statementDate: string, check: ReconciliationCheckResult): string {
  const metricLabelByCode: Record<ReconciliationCheckResult["metric"], string> = {
    cash: "Cash reconciliation",
    nlv: "NLV reconciliation",
    openPositionValue: "Open-position value reconciliation",
    equityLineItemCount: "Equity line-item count",
    optionLineItemCount: "Option line-item count",
  };

  return [
    `[${accountExternalId} ${statementDate}]`,
    `${metricLabelByCode[check.metric]} failed`,
    `expected=${check.expected}`,
    `actual=${check.actual}`,
    `delta=${check.delta}`,
    `tolerance=${check.tolerance}`,
  ].join(" ");
}

export function reconcileStatementSnapshot(
  reference: StatementSnapshotReference,
  dashboard: DashboardReconciliationSnapshot,
  tolerance: ReconciliationToleranceConfig = DEFAULT_RECONCILIATION_TOLERANCE,
): AccountReconciliationResult {
  const checks: ReconciliationCheckResult[] = [
    buildCheck("cash", reference.totalCash, dashboard.totalCash, tolerance.cash),
    buildCheck("nlv", reference.netLiquidatingValue, dashboard.netLiquidatingValue, tolerance.nlv),
    buildCheck(
      "openPositionValue",
      reference.impliedOpenPositionValue,
      dashboard.impliedOpenPositionValue,
      tolerance.openPositionValue,
    ),
    buildCheck("equityLineItemCount", reference.equityLineItemCount, dashboard.equityLineItemCount, tolerance.lineItemCount),
    buildCheck("optionLineItemCount", reference.optionLineItemCount, dashboard.optionLineItemCount, tolerance.lineItemCount),
  ];

  const discrepancies = checks
    .filter((check) => !check.passed)
    .map((check) => toDiscrepancyLine(reference.accountExternalId, reference.statementDate, check));

  return {
    accountExternalId: reference.accountExternalId,
    statementDate: reference.statementDate,
    passed: discrepancies.length === 0,
    checks,
    discrepancies,
  };
}

export function runStatementReconciliationSuite(
  references: StatementSnapshotReference[],
  dashboards: DashboardReconciliationSnapshot[],
  tolerance: ReconciliationToleranceConfig = DEFAULT_RECONCILIATION_TOLERANCE,
): ReconciliationSuiteResult {
  const dashboardByAccountAndDate = new Map(
    dashboards.map((snapshot) => [`${snapshot.accountExternalId}::${snapshot.statementDate}`, snapshot]),
  );

  const results: AccountReconciliationResult[] = [];
  const discrepancies: string[] = [];

  for (const reference of references) {
    const key = `${reference.accountExternalId}::${reference.statementDate}`;
    const dashboardSnapshot = dashboardByAccountAndDate.get(key);
    if (!dashboardSnapshot) {
      discrepancies.push(
        `[${reference.accountExternalId} ${reference.statementDate}] Missing dashboard snapshot for reconciliation.`,
      );
      results.push({
        accountExternalId: reference.accountExternalId,
        statementDate: reference.statementDate,
        passed: false,
        checks: [],
        discrepancies: [
          `[${reference.accountExternalId} ${reference.statementDate}] Missing dashboard snapshot for reconciliation.`,
        ],
      });
      continue;
    }

    const result = reconcileStatementSnapshot(reference, dashboardSnapshot, tolerance);
    results.push(result);
    discrepancies.push(...result.discrepancies);
  }

  return {
    passed: discrepancies.length === 0,
    results,
    discrepancies,
  };
}
