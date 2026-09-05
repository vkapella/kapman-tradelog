import type { Prisma } from "@prisma/client";

/**
 * One classification for every persisted cash-event row (#356).
 *
 * The value engine, the reconciliation compute, return-on-capital and the
 * diagnostics must agree on what a cash row *is* before any of them sums it:
 *
 * - `external_flow`            money entering or leaving the account (transfers,
 *                              wires, ACAT cash, thinkorswim FND/LIQ/RAD funding
 *                              and bookkeeping). Counted in cash; treated as a
 *                              contribution/withdrawal by return-on-capital (#362).
 * - `internal_cash_equivalent` a sweep between cash and a money-market fund, or
 *                              the reinvestment leg of a money-market dividend.
 *                              Total cash-equivalents do not change (#346, #352).
 * - `excluded_sub_account`     a journal to a sub-account whose value the equity
 *                              NLV never includes (thinkorswim paper forex, #361).
 * - `internal_journal`         Fidelity cash<->margin type journals that pair to
 *                              zero (#369).
 * - `income`                   dividends and interest; counted in cash, never a flow.
 * - `broker_adjustment`        every other persisted row (fee reimbursements,
 *                              residual JRN/WIN rows, unknown types); counted in
 *                              cash, never a flow.
 */
export type CashRowClass =
  | "external_flow"
  | "internal_cash_equivalent"
  | "excluded_sub_account"
  | "internal_journal"
  | "income"
  | "broker_adjustment";

export const EXTERNAL_FLOW_ROW_TYPES = [
  "TRANSFER_IN",
  "TRANSFER_OUT",
  "TRANSFER_ADJUSTMENT",
  "ACAT_RECEIVE",
  "ACAT_CREDIT",
  "FND",
  "LIQ",
  "RAD",
] as const;

export const INTERNAL_CASH_EQUIVALENT_ROW_TYPES = [
  "MONEY_MARKET",
  "MONEY_MARKET_BUY",
  "MONEY_MARKET_REDEEM",
  "MONEY_MARKET_EXCHANGE_OUT",
  "MONEY_MARKET_EXCHANGE_IN",
  "REDEMPTION",
] as const;

export const INTERNAL_JOURNAL_ROW_TYPES = ["INTERNAL_JOURNAL"] as const;

export const INCOME_ROW_TYPES = ["DIVIDEND", "MONEY_MARKET_DIVIDEND", "REINVESTMENT"] as const;

/** thinkorswim paper accounts journal forex money through an FND row. */
const EXCLUDED_SUB_ACCOUNT_DESCRIPTION = /\bforex\b/i;

const EXTERNAL = new Set<string>(EXTERNAL_FLOW_ROW_TYPES);
const INTERNAL = new Set<string>(INTERNAL_CASH_EQUIVALENT_ROW_TYPES);
const JOURNAL = new Set<string>(INTERNAL_JOURNAL_ROW_TYPES);
const INCOME = new Set<string>(INCOME_ROW_TYPES);

export const CASH_ROW_CLASSES: readonly CashRowClass[] = [
  "external_flow",
  "internal_cash_equivalent",
  "excluded_sub_account",
  "internal_journal",
  "income",
  "broker_adjustment",
];

/** The name reconciliation payloads use to say which classification produced their figures. */
export const CASH_LEDGER_BASIS = "classified_ledger_v1" as const;

export interface CashRowLike {
  rowType: string;
  amount: Prisma.Decimal | number | string;
  description?: string | null;
}

function toNumber(value: Prisma.Decimal | number | string): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function classifyCashRow(row: CashRowLike): CashRowClass {
  if (row.rowType === "FND" && row.description && EXCLUDED_SUB_ACCOUNT_DESCRIPTION.test(row.description)) {
    return "excluded_sub_account";
  }
  if (INTERNAL.has(row.rowType)) {
    return "internal_cash_equivalent";
  }
  // A money-market dividend arrives as two rows: the dividend (positive, income)
  // and its reinvestment (negative). The reinvestment only moves the income into
  // the fund, a cash equivalent, so it is sweep bookkeeping too (#352).
  if (row.rowType === "MONEY_MARKET_DIVIDEND" && toNumber(row.amount) < 0) {
    return "internal_cash_equivalent";
  }
  if (JOURNAL.has(row.rowType)) {
    return "internal_journal";
  }
  if (EXTERNAL.has(row.rowType)) {
    return "external_flow";
  }
  if (INCOME.has(row.rowType)) {
    return "income";
  }
  return "broker_adjustment";
}

/**
 * The row's contribution to reconstructed cash-and-equivalents. Zero for rows
 * that move value between two things the account already owns or to a
 * sub-account the equity NLV never sees.
 */
export function cashLedgerAmount(row: CashRowLike): number {
  const rowClass = classifyCashRow(row);
  if (rowClass === "internal_cash_equivalent" || rowClass === "excluded_sub_account" || rowClass === "internal_journal") {
    return 0;
  }
  return toNumber(row.amount);
}

export function isExternalFlowRow(row: CashRowLike): boolean {
  return classifyCashRow(row) === "external_flow";
}

export interface CashRowSummary {
  ledgerTotal: number;
  externalFlows: number;
  byClass: Record<CashRowClass, number>;
  rowCountByClass: Record<CashRowClass, number>;
}

export function summarizeCashRows(rows: readonly CashRowLike[]): CashRowSummary {
  const byClass = Object.fromEntries(CASH_ROW_CLASSES.map((c) => [c, 0])) as Record<CashRowClass, number>;
  const rowCountByClass = Object.fromEntries(CASH_ROW_CLASSES.map((c) => [c, 0])) as Record<CashRowClass, number>;
  let ledgerTotal = 0;
  for (const row of rows) {
    const rowClass = classifyCashRow(row);
    byClass[rowClass] += toNumber(row.amount);
    rowCountByClass[rowClass] += 1;
    ledgerTotal += cashLedgerAmount(row);
  }
  return { ledgerTotal, externalFlows: byClass.external_flow, byClass, rowCountByClass };
}

function isRecord(value: Prisma.JsonValue | null | undefined): value is Prisma.JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function jsonStringField(value: Prisma.JsonValue | undefined): string | null {
  return typeof value === "string" ? value : null;
}

/**
 * ACAT share receives are imported as BUY TO_OPEN executions at a provisional
 * transfer-date basis. No cash left the account for them, so the value engine
 * treats them as cash-neutral; the transferred value is an in-kind external
 * contribution (#357).
 */
export function isCashNeutralTransferReceive(rawRowJson: Prisma.JsonValue | null | undefined): boolean {
  if (!isRecord(rawRowJson)) {
    return false;
  }
  const action = jsonStringField(rawRowJson.action)?.toUpperCase() ?? "";
  const rawAction = jsonStringField(rawRowJson.rawAction)?.toUpperCase() ?? "";
  return action.includes("ACAT_RECEIVE") || rawAction.includes("ACAT RECEIVE");
}

export interface InKindTransferExecutionLike {
  assetClass: string;
  side: string | null;
  quantity: Prisma.Decimal | string | number;
  price: Prisma.Decimal | string | number | null;
  rawRowJson?: Prisma.JsonValue | null;
}

/**
 * Transfer-date value of an in-kind receive, or 0 for any other execution. An
 * explicit basis override (EXECUTION_PRICE_OVERRIDE) replaces the provisional
 * price when supplied.
 */
export function inKindTransferValue(execution: InKindTransferExecutionLike, overridePrice: number | null = null): number {
  if (!isCashNeutralTransferReceive(execution.rawRowJson) || execution.side !== "BUY") {
    return 0;
  }
  const price = overridePrice ?? (execution.price === null ? null : toNumber(execution.price));
  if (price === null || !Number.isFinite(price) || price < 0) {
    return 0;
  }
  const quantity = Math.abs(toNumber(execution.quantity));
  const multiplier = execution.assetClass === "OPTION" ? 100 : 1;
  return quantity * price * multiplier;
}
