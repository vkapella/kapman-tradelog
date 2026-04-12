import { createHash } from "node:crypto";
import type { AdapterWarning, BrokerAdapter, DetectionResult, NormalizedCashEvent, NormalizedExecution, ParseResult, UploadedFile } from "./types";
import { FidelityAdapter as FidelityV8Adapter } from "./fidelity/index";
import type { CashEventImportRecord, ExecutionImportRecord, FidelityPreviewRow } from "./fidelity/types";

const FIDELITY_HEADER =
  "Run Date,Action,Symbol,Description,Type,Price ($),Quantity,Commission ($),Fees ($),Accrued Interest ($),Amount ($),Cash Balance ($),Settlement Date";

const FALLBACK_ACCOUNT_ID = "UNKNOWN_FIDELITY_ACCOUNT";

const fidelityV8Adapter = new FidelityV8Adapter();

function detectFidelity(file: UploadedFile): DetectionResult {
  const text = file.content.replace(/^\uFEFF/, "");
  const lines = text.split(/\r?\n/);
  const headerLine = (lines[2] ?? "").trim();

  const filenameMatch = /History_for_Account_[A-Z0-9]+-\d+\.csv$/.test(file.name);
  const headerMatch = headerLine === FIDELITY_HEADER;
  const bodyHintMatch = text.includes("Run Date,Action,Symbol,Description") && text.includes("Settlement Date");

  const matched = headerMatch || (filenameMatch && bodyHintMatch);
  const confidence = headerMatch ? 1 : matched ? 0.8 : 0;

  return {
    matched,
    confidence,
    brokerId: "fidelity",
    formatVersion: matched ? "fidelity-history-v8" : "unknown",
    reason: matched ? "Matched Fidelity History for Account CSV header structure." : "Missing Fidelity History for Account markers.",
    warnings: [],
  };
}

function toOpeningClosingEffect(value: ExecutionImportRecord["openClose"]): "TO_OPEN" | "TO_CLOSE" | "UNKNOWN" {
  if (value === "OPEN") {
    return "TO_OPEN";
  }

  if (value === "CLOSE") {
    return "TO_CLOSE";
  }

  return "UNKNOWN";
}

function buildFidelityCashEventRefNumber(
  accountId: string,
  eventDate: Date,
  cashEventType: CashEventImportRecord["cashEventType"],
  symbol: string,
  amount: number,
): string {
  const normalizedSymbol = symbol.trim().toUpperCase() || "NOSYM";
  const key = [
    accountId,
    eventDate.toISOString().slice(0, 10),
    cashEventType,
    normalizedSymbol,
    amount.toString(),
  ].join("|");

  const digest = createHash("sha256").update(key).digest("hex");
  return `FIDELITY-${digest.slice(0, 32)}(${normalizedSymbol})`;
}

function toRawString(value: string | number | null | undefined): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  return String(value);
}

function toExecution(record: ExecutionImportRecord): NormalizedExecution | null {
  if (!record.executionDate) {
    return null;
  }

  return {
    eventTimestamp: record.executionDate,
    tradeDate: record.executionDate,
    eventType: "TRADE",
    assetClass: record.assetClass,
    symbol: record.symbol,
    side: record.side,
    quantity: record.quantity,
    price: record.price,
    grossAmount: record.amount,
    netAmount: record.amount,
    openingClosingEffect: toOpeningClosingEffect(record.openClose),
    underlyingSymbol: record.underlyingTicker,
    optionType: record.optionType,
    strike: record.strikePrice,
    expirationDate: record.expirationDate ? new Date(`${record.expirationDate}T00:00:00.000Z`) : null,
    spread: "SINGLE",
    spreadGroupId: record.assignmentLinkId,
    brokerRefNumber: null,
    sourceRowRef: String(record.rowIndex),
    rawRowJson: {
      action: toRawString(record.actionClassification),
      rawAction: toRawString(record.rawAction),
      marginType: toRawString(record.marginType),
      amount: toRawString(record.amount),
      price: toRawString(record.price),
      quantity: toRawString(record.quantity),
      assignmentLinkId: toRawString(record.assignmentLinkId),
    },
  };
}

function toCashEvent(accountId: string, record: CashEventImportRecord): NormalizedCashEvent | null {
  if (!record.eventDate || record.amount === null) {
    return null;
  }

  return {
    eventDate: record.eventDate,
    rowType: record.cashEventType,
    refNumber: buildFidelityCashEventRefNumber(accountId, record.eventDate, record.cashEventType, record.symbol, record.amount),
    description: record.description,
    amount: record.amount,
    symbol: record.symbol,
    marginType: record.marginType,
  };
}

function toAdapterWarnings(rows: Array<{ code: string; message: string; rowRef?: string }>): AdapterWarning[] {
  return rows.map((warning) => ({
    code: warning.code,
    message: warning.message,
    rowRef: warning.rowRef,
  }));
}

function parseFidelity(file: UploadedFile): ParseResult {
  const parsed = fidelityV8Adapter.parse(Buffer.from(file.content, "utf8"), file.name);
  const resolvedAccountId = parsed.accountId ?? FALLBACK_ACCOUNT_ID;

  const warnings: Array<{ code: string; message: string; rowRef?: string }> = parsed.warnings.map((warning: { rowIndex: number; message: string }) => ({
    code: "FIDELITY_WARNING",
    message: warning.message,
    rowRef: String(warning.rowIndex),
  }));

  if (!parsed.accountId) {
    warnings.push({
      code: "FIDELITY_ACCOUNT_ID_MISSING",
      message: `Account id could not be extracted from filename '${file.name}'.`,
    });
  }

  const executions: NormalizedExecution[] = [];
  const cashEvents: NormalizedCashEvent[] = [];

  for (const record of parsed.records) {
    if (record.kind === "EXECUTION") {
      const execution = toExecution(record);
      if (!execution) {
        warnings.push({
          code: "FIDELITY_EXECUTION_SKIPPED",
          message: "Execution row skipped because execution date is missing.",
          rowRef: String(record.rowIndex),
        });
        continue;
      }

      executions.push(execution);
      continue;
    }

    const cashEvent = toCashEvent(resolvedAccountId, record);
    if (!cashEvent) {
      warnings.push({
        code: "FIDELITY_CASH_EVENT_SKIPPED",
        message: "Cash event row skipped because event date or amount is missing.",
        rowRef: String(record.rowIndex),
      });
      continue;
    }

    cashEvents.push(cashEvent);
  }

  const parseResult: ParseResult = {
    warnings: toAdapterWarnings(warnings),
    accountMetadata: {
      accountId: resolvedAccountId,
      label: `Fidelity ${resolvedAccountId}`,
      paperMoney: false,
    },
    executions,
    snapshots: [],
    cashEvents,
    parsedRows: parsed.rawRowCount,
    skippedRows: Math.max(0, parsed.rawRowCount - parsed.records.length),
  };

  parseResult.previewRows = parsed.previewRows.map((row: FidelityPreviewRow) => ({
    kind: "fidelity",
    rowIndex: row.rowIndex,
    executionDate: row.executionDate,
    actionClassification: row.actionClassification,
    symbol: row.symbol,
    underlyingTicker: row.underlyingTicker,
    assetClass: row.assetClass,
    side: row.side,
    openClose: row.openClose,
    quantity: row.quantity,
    price: row.price,
    amount: row.amount,
    marginType: row.marginType,
    status: row.status,
    warningMessage: row.warningMessage,
  }));

  return parseResult;
}

export const fidelityAdapter: BrokerAdapter = {
  id: "fidelity",
  displayName: "Fidelity",
  status: "active",
  detect: detectFidelity,
  parse: parseFidelity,
  coverage() {
    return {
      equities: true,
      options: true,
      multiLeg: false,
      snapshots: false,
      feesFromCashBalance: false,
      notes: "Fidelity History for Account CSV adapter with option/equity execution and cash-event support.",
    };
  },
};
