import { randomUUID } from "node:crypto";
import { classifyAction } from "./classifier";
import { parseOptionSymbol } from "./symbol-parser";
import type {
  ActionClassification,
  CashEventImportRecord,
  ExecutionImportRecord,
  FidelityPreviewRow,
  ImportRecord,
  ImportRecordStatus,
  ImportWarning,
  RawFidelityRow,
  TransformResult,
} from "./types";

const MONEY_MARKET_SYMBOLS = new Set(["SPAXX", "FSIXX"]);

function toIsoDate(value: Date | null): string | null {
  return value ? value.toISOString().slice(0, 10) : null;
}

function toActionClassificationString(classification: ActionClassification): string {
  if (classification.kind === "CASH_EVENT") {
    return `CASH_EVENT ${classification.cashEventType}`;
  }

  if (classification.kind === "EXECUTION") {
    return `EXECUTION ${classification.side} ${classification.openClose ?? "null"} ${classification.assetClass}`;
  }

  return classification.kind;
}

function makePreviewRow(input: {
  rowIndex: number;
  executionDate: Date | null;
  actionClassification: string;
  symbol: string;
  underlyingTicker: string | null;
  assetClass: "OPTION" | "EQUITY" | "CASH_EVENT" | null;
  side: "BUY" | "SELL" | null;
  openClose: "OPEN" | "CLOSE" | null;
  quantity: number | null;
  price: number | null;
  amount: number | null;
  marginType: "Cash" | "Margin" | null;
  status: ImportRecordStatus;
  warningMessage?: string;
}): FidelityPreviewRow {
  return {
    rowIndex: input.rowIndex,
    executionDate: toIsoDate(input.executionDate),
    actionClassification: input.actionClassification,
    symbol: input.symbol,
    underlyingTicker: input.underlyingTicker,
    assetClass: input.assetClass,
    side: input.side,
    openClose: input.openClose,
    quantity: input.quantity,
    price: input.price,
    amount: input.amount,
    marginType: input.marginType,
    status: input.status,
    warningMessage: input.warningMessage,
  };
}

function assignmentMatchKey(executionDate: Date | null, underlyingTicker: string): string {
  return `${toIsoDate(executionDate) ?? ""}|${underlyingTicker.toUpperCase()}`;
}

export function transformFidelityRows(rows: RawFidelityRow[], accountId: string | null): TransformResult {
  const records: ImportRecord[] = [];
  const previewRows: FidelityPreviewRow[] = [];
  const warnings: ImportWarning[] = [];

  let cancelledCount = 0;
  let skippedBlankCount = 0;

  const previewRowByCsvRow = new Map<number, number>();
  const assignmentOptionRows = new Map<string, ExecutionImportRecord[]>();
  const assignmentEquityRows = new Map<string, ExecutionImportRecord[]>();

  const appendWarning = (rowIndex: number, rawAction: string, message: string) => {
    warnings.push({ rowIndex, rawAction, message });
  };

  const markPreviewWarning = (csvRowIndex: number, message: string) => {
    const previewIndex = previewRowByCsvRow.get(csvRowIndex);
    if (previewIndex === undefined) {
      return;
    }

    const preview = previewRows[previewIndex];
    preview.status = "WARNING";
    preview.warningMessage = preview.warningMessage ? `${preview.warningMessage} | ${message}` : message;
  };

  rows.forEach((row, rowArrayIndex) => {
    const csvRowIndex = rowArrayIndex + 4;
    const rawAction = row.rawAction.trim();

    if (!rawAction) {
      skippedBlankCount += 1;
      const preview = makePreviewRow({
        rowIndex: csvRowIndex,
        executionDate: row.runDate,
        actionClassification: "SKIPPED",
        symbol: row.symbol,
        underlyingTicker: null,
        assetClass: null,
        side: null,
        openClose: null,
        quantity: row.quantity,
        price: row.price,
        amount: row.amount,
        marginType: row.marginType,
        status: "SKIPPED",
      });
      previewRowByCsvRow.set(csvRowIndex, previewRows.length);
      previewRows.push(preview);
      return;
    }

    const rawActionUpper = rawAction.toUpperCase();
    const classification = classifyAction(rawAction);

    if (classification.kind === "CANCELLED") {
      cancelledCount += 1;
      appendWarning(csvRowIndex, rawAction, "Cancelled row skipped.");
      const preview = makePreviewRow({
        rowIndex: csvRowIndex,
        executionDate: row.runDate,
        actionClassification: "CANCELLED",
        symbol: row.symbol,
        underlyingTicker: null,
        assetClass: null,
        side: null,
        openClose: null,
        quantity: row.quantity,
        price: row.price,
        amount: row.amount,
        marginType: row.marginType,
        status: "CANCELLED",
        warningMessage: "Cancelled row skipped.",
      });
      previewRowByCsvRow.set(csvRowIndex, previewRows.length);
      previewRows.push(preview);
      return;
    }

    if (classification.kind === "UNKNOWN") {
      const message = `Unknown Fidelity action; row skipped: ${rawAction}`;
      appendWarning(csvRowIndex, rawAction, message);
      const preview = makePreviewRow({
        rowIndex: csvRowIndex,
        executionDate: row.runDate,
        actionClassification: "UNKNOWN",
        symbol: row.symbol,
        underlyingTicker: null,
        assetClass: null,
        side: null,
        openClose: null,
        quantity: row.quantity,
        price: row.price,
        amount: row.amount,
        marginType: row.marginType,
        status: "WARNING",
        warningMessage: message,
      });
      previewRowByCsvRow.set(csvRowIndex, previewRows.length);
      previewRows.push(preview);
      return;
    }

    const normalizedSymbol = row.symbol.trim();
    let effectiveClassification = classification;

    if (effectiveClassification.kind === "EXECUTION" && MONEY_MARKET_SYMBOLS.has(normalizedSymbol.toUpperCase())) {
      effectiveClassification = { kind: "CASH_EVENT", cashEventType: "MONEY_MARKET" };
    }

    if (effectiveClassification.kind === "CASH_EVENT") {
      const record: CashEventImportRecord = {
        kind: "CASH_EVENT",
        rowIndex: csvRowIndex,
        status: "VALID",
        accountId,
        eventDate: row.runDate,
        cashEventType: effectiveClassification.cashEventType,
        symbol: normalizedSymbol,
        description: row.description,
        amount: row.amount,
        marginType: row.marginType,
        rawAction,
        actionClassification: toActionClassificationString(effectiveClassification),
      };

      records.push(record);

      const preview = makePreviewRow({
        rowIndex: csvRowIndex,
        executionDate: row.runDate,
        actionClassification: record.actionClassification,
        symbol: record.symbol,
        underlyingTicker: null,
        assetClass: "CASH_EVENT",
        side: null,
        openClose: null,
        quantity: row.quantity,
        price: row.price,
        amount: row.amount,
        marginType: row.marginType,
        status: "VALID",
      });

      previewRowByCsvRow.set(csvRowIndex, previewRows.length);
      previewRows.push(preview);
      return;
    }

    const optionDetails = parseOptionSymbol(normalizedSymbol);
    const executionRecord: ExecutionImportRecord = {
      kind: "EXECUTION",
      rowIndex: csvRowIndex,
      status: "VALID",
      accountId,
      executionDate: row.runDate,
      settlementDate: row.settlementDate,
      symbol: normalizedSymbol,
      description: row.description,
      marginType: row.marginType,
      rawAction,
      actionClassification: toActionClassificationString(effectiveClassification),
      underlyingTicker: optionDetails?.underlyingTicker ?? normalizedSymbol,
      assetClass: effectiveClassification.assetClass,
      optionType: optionDetails?.optionType ?? null,
      expirationDate: optionDetails?.expirationDate ?? null,
      strikePrice: optionDetails?.strikePrice ?? null,
      side: effectiveClassification.side,
      openClose: effectiveClassification.openClose,
      quantity: Math.abs(row.quantity ?? 0),
      price: row.price,
      commission: row.commission ?? 0,
      fees: row.fees ?? 0,
      amount: row.amount,
      assignmentLinkId: null,
    };

    records.push(executionRecord);

    const preview = makePreviewRow({
      rowIndex: csvRowIndex,
      executionDate: row.runDate,
      actionClassification: executionRecord.actionClassification,
      symbol: executionRecord.symbol,
      underlyingTicker: executionRecord.underlyingTicker,
      assetClass: executionRecord.assetClass,
      side: executionRecord.side,
      openClose: executionRecord.openClose,
      quantity: executionRecord.quantity,
      price: executionRecord.price,
      amount: executionRecord.amount,
      marginType: executionRecord.marginType,
      status: "VALID",
    });

    previewRowByCsvRow.set(csvRowIndex, previewRows.length);
    previewRows.push(preview);

    const key = assignmentMatchKey(executionRecord.executionDate, executionRecord.underlyingTicker);
    if (rawActionUpper.includes("ASSIGNED AS OF")) {
      const bucket = assignmentOptionRows.get(key) ?? [];
      bucket.push(executionRecord);
      assignmentOptionRows.set(key, bucket);
    }

    if (rawActionUpper.includes("YOU BOUGHT ASSIGNED")) {
      const bucket = assignmentEquityRows.get(key) ?? [];
      bucket.push(executionRecord);
      assignmentEquityRows.set(key, bucket);
    }
  });

  const assignmentKeys = new Set<string>([
    ...Array.from(assignmentOptionRows.keys()),
    ...Array.from(assignmentEquityRows.keys()),
  ]);
  for (const key of Array.from(assignmentKeys)) {
    const optionRows = assignmentOptionRows.get(key) ?? [];
    const equityRows = assignmentEquityRows.get(key) ?? [];

    while (optionRows.length > 0 && equityRows.length > 0) {
      const optionRecord = optionRows.shift();
      const equityRecord = equityRows.shift();
      if (!optionRecord || !equityRecord) {
        continue;
      }

      const assignmentLinkId = randomUUID();
      optionRecord.assignmentLinkId = assignmentLinkId;
      equityRecord.assignmentLinkId = assignmentLinkId;
    }

    for (const unmatched of optionRows) {
      const message = `Assignment option leg could not be paired with an assigned equity leg for key ${key}.`;
      appendWarning(unmatched.rowIndex, unmatched.rawAction, message);
      markPreviewWarning(unmatched.rowIndex, message);
      unmatched.status = "WARNING";
    }

    for (const unmatched of equityRows) {
      const message = `Assigned equity leg could not be paired with an assignment option leg for key ${key}.`;
      appendWarning(unmatched.rowIndex, unmatched.rawAction, message);
      markPreviewWarning(unmatched.rowIndex, message);
      unmatched.status = "WARNING";
    }
  }

  return {
    records,
    previewRows,
    warnings,
    cancelledCount,
    skippedBlankCount,
  };
}
