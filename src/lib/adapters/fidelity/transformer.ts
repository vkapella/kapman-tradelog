import { randomUUID } from "node:crypto";
import { classifyAction } from "./classifier";
import { parseOptionSymbol } from "./symbol-parser";
import type {
  ActionClassification,
  CancelRebookInfo,
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

type PreparedFidelityRow = {
  row: RawFidelityRow;
  rowArrayIndex: number;
  csvRowIndex: number;
  rawActionUpper: string;
  descriptionUpper: string;
  classification: ActionClassification;
  settlementDateKey: string | null;
  symbolKey: string;
};

interface CancelRebookDecision {
  dropRow: boolean;
  infoMessage: string;
  keepAsCancelRebookRepresentative?: boolean;
}

interface CancelRebookPreprocessResult {
  decisions: Map<number, CancelRebookDecision>;
  warnings: ImportWarning[];
  infos: CancelRebookInfo[];
  cancelledCount: number;
  cancelRebookOriginalDropCount: number;
}

function toSettlementDateKey(settlementDate: Date | null): string | null {
  return settlementDate ? settlementDate.toISOString().slice(0, 10) : null;
}

function isCancelAction(rawActionUpper: string): boolean {
  return rawActionUpper.startsWith("BUY CANCEL") || rawActionUpper.startsWith("SELL CANCEL");
}

function isCancelDescription(descriptionUpper: string): boolean {
  return descriptionUpper.includes("CXL") && descriptionUpper.includes("CANCELLED TRADE");
}

function isCancelRow(row: PreparedFidelityRow): boolean {
  return isCancelAction(row.rawActionUpper) && (isCancelDescription(row.descriptionUpper) || isCancelDescription(row.rawActionUpper));
}

function isCorrectionRow(row: PreparedFidelityRow): boolean {
  const actionMatches = row.rawActionUpper.startsWith("YOU BOUGHT") || row.rawActionUpper.startsWith("YOU SOLD");
  const descriptionMatches =
    (row.descriptionUpper.includes("CORR") && row.descriptionUpper.includes("CORRECTED CONFIRM")) ||
    (row.rawActionUpper.includes("CORR") && row.rawActionUpper.includes("CORRECTED CONFIRM"));
  return actionMatches && descriptionMatches;
}

function sideFromCancelAction(rawActionUpper: string): "BUY" | "SELL" | null {
  if (rawActionUpper.startsWith("BUY CANCEL")) {
    return "BUY";
  }

  if (rawActionUpper.startsWith("SELL CANCEL")) {
    return "SELL";
  }

  return null;
}

function openCloseFromCancelAction(rawActionUpper: string): "OPEN" | "CLOSE" | null {
  if (rawActionUpper.includes("OPENING TRANSACTION")) {
    return "OPEN";
  }

  if (rawActionUpper.includes("CLOSING TRANSACTION")) {
    return "CLOSE";
  }

  return null;
}

function hasMatchingExecutionSignature(
  row: PreparedFidelityRow,
  input: {
    side: "BUY" | "SELL" | null;
    openClose: "OPEN" | "CLOSE" | null;
    absQuantity: number;
    price: number | null;
  },
): boolean {
  if (row.classification.kind !== "EXECUTION") {
    return false;
  }

  if (!input.side || row.classification.side !== input.side) {
    return false;
  }

  if (input.openClose && row.classification.openClose !== input.openClose) {
    return false;
  }

  const rowAbsQuantity = Math.abs(row.row.quantity ?? 0);
  if (rowAbsQuantity === 0 || rowAbsQuantity !== input.absQuantity) {
    return false;
  }

  if (row.row.price === null || input.price === null) {
    return false;
  }

  return row.row.price === input.price;
}

function preprocessCancelRebookRows(rows: RawFidelityRow[]): CancelRebookPreprocessResult {
  const preparedRows: PreparedFidelityRow[] = rows.map((row, rowArrayIndex) => ({
    row,
    rowArrayIndex,
    csvRowIndex: rowArrayIndex + 4,
    rawActionUpper: row.rawAction.trim().toUpperCase(),
    descriptionUpper: row.description.trim().toUpperCase(),
    classification: classifyAction(row.rawAction),
    settlementDateKey: toSettlementDateKey(row.settlementDate),
    symbolKey: row.symbol.trim().toUpperCase(),
  }));

  const groups = new Map<string, PreparedFidelityRow[]>();
  for (const prepared of preparedRows) {
    if (!prepared.symbolKey) {
      continue;
    }

    const settlementKey = prepared.settlementDateKey ?? "UNKNOWN_SETTLEMENT";
    const key = `${prepared.symbolKey}|${settlementKey}`;
    const bucket = groups.get(key) ?? [];
    bucket.push(prepared);
    groups.set(key, bucket);
  }

  const decisions = new Map<number, CancelRebookDecision>();
  const warnings: ImportWarning[] = [];
  const infos: CancelRebookInfo[] = [];
  let cancelledCount = 0;
  let cancelRebookOriginalDropCount = 0;

  const setDropDecision = (prepared: PreparedFidelityRow, infoMessage: string) => {
    decisions.set(prepared.rowArrayIndex, { dropRow: true, infoMessage });
  };

  const markRepresentative = (prepared: PreparedFidelityRow) => {
    const existing = decisions.get(prepared.rowArrayIndex);
    decisions.set(prepared.rowArrayIndex, {
      dropRow: false,
      infoMessage: existing?.infoMessage ?? "CANCEL_REBOOK representative row retained.",
      keepAsCancelRebookRepresentative: true,
    });
  };

  for (const groupRows of Array.from(groups.values())) {
    const sortedRows = [...groupRows].sort((left, right) => left.csvRowIndex - right.csvRowIndex);
    const consumed = new Set<number>();

    const cancelRows = sortedRows.filter((row) => isCancelRow(row));
    for (const cancelRow of cancelRows) {
      if (consumed.has(cancelRow.rowArrayIndex)) {
        continue;
      }

      const side = sideFromCancelAction(cancelRow.rawActionUpper);
      const openClose = openCloseFromCancelAction(cancelRow.rawActionUpper);
      const absQuantity = Math.abs(cancelRow.row.quantity ?? 0);
      const price = cancelRow.row.price;
      const settlementDate = cancelRow.settlementDateKey;
      const settlementLabel = settlementDate ?? "unknown settlement date";

      const corrCandidates = sortedRows.filter(
        (candidate) =>
          !consumed.has(candidate.rowArrayIndex) &&
          candidate.rowArrayIndex !== cancelRow.rowArrayIndex &&
          isCorrectionRow(candidate) &&
          hasMatchingExecutionSignature(candidate, { side, openClose, absQuantity, price }),
      );
      const corrRow = corrCandidates.find((candidate) => candidate.csvRowIndex >= cancelRow.csvRowIndex) ?? corrCandidates[0] ?? null;

      const originalCandidates = sortedRows.filter(
        (candidate) =>
          !consumed.has(candidate.rowArrayIndex) &&
          candidate.rowArrayIndex !== cancelRow.rowArrayIndex &&
          !isCancelRow(candidate) &&
          !isCorrectionRow(candidate) &&
          hasMatchingExecutionSignature(candidate, { side, openClose, absQuantity, price }),
      );
      const originalBeforeCancel = originalCandidates.filter((candidate) => candidate.csvRowIndex <= cancelRow.csvRowIndex);
      const originalRow =
        originalBeforeCancel[originalBeforeCancel.length - 1] ??
        originalCandidates.find((candidate) => candidate.csvRowIndex > cancelRow.csvRowIndex) ??
        null;

      if (corrRow && originalRow) {
        cancelledCount += 1;
        cancelRebookOriginalDropCount += 1;
        consumed.add(cancelRow.rowArrayIndex);
        consumed.add(originalRow.rowArrayIndex);
        consumed.add(corrRow.rowArrayIndex);

        setDropDecision(cancelRow, "CANCEL_REBOOK triplet collapse: cancel row removed.");
        setDropDecision(originalRow, "CANCEL_REBOOK triplet collapse: original row removed.");
        markRepresentative(corrRow);

        infos.push({
          code: "CANCEL_REBOOK",
          rowIndexes: [originalRow.csvRowIndex, cancelRow.csvRowIndex, corrRow.csvRowIndex],
          message: `Collapsed cancel/rebook triplet for ${cancelRow.row.symbol} ${settlementLabel}; retained CORR representative row.`,
          symbol: cancelRow.row.symbol,
          settlementDate,
        });
        continue;
      }

      if (corrRow && !originalRow) {
        cancelledCount += 1;
        consumed.add(cancelRow.rowArrayIndex);
        consumed.add(corrRow.rowArrayIndex);

        setDropDecision(cancelRow, "CANCEL_REBOOK pair collapse: cancel row removed.");
        markRepresentative(corrRow);

        infos.push({
          code: "CANCEL_REBOOK",
          rowIndexes: [cancelRow.csvRowIndex, corrRow.csvRowIndex],
          message: `Collapsed cancel/correction pair for ${cancelRow.row.symbol} ${settlementLabel}; retained CORR representative row.`,
          symbol: cancelRow.row.symbol,
          settlementDate,
        });
        continue;
      }

      cancelledCount += 1;
      consumed.add(cancelRow.rowArrayIndex);
      setDropDecision(cancelRow, "CANCEL_REBOOK with no correction: cancel row removed.");

      if (originalRow) {
        cancelRebookOriginalDropCount += 1;
        consumed.add(originalRow.rowArrayIndex);
        setDropDecision(originalRow, "CANCEL_REBOOK with no correction: original row removed.");
      }

      warnings.push({
        code: "CANCEL_REBOOK_MISSING_CORRECTION",
        rowIndex: cancelRow.csvRowIndex,
        rawAction: cancelRow.row.rawAction,
        message: `Trade cancelled with no correction found for ${cancelRow.row.symbol} ${settlementLabel}`,
      });
    }

    for (const row of sortedRows) {
      if (!isCorrectionRow(row) || consumed.has(row.rowArrayIndex)) {
        continue;
      }

      warnings.push({
        code: "CANCEL_REBOOK_MISSING_CANCEL",
        rowIndex: row.csvRowIndex,
        rawAction: row.row.rawAction,
        message: `CORR row found with no matching CANCEL for ${row.row.symbol} ${row.settlementDateKey ?? "unknown settlement date"}`,
      });
    }
  }

  return {
    decisions,
    warnings,
    infos,
    cancelledCount,
    cancelRebookOriginalDropCount,
  };
}

export function transformFidelityRows(rows: RawFidelityRow[], accountId: string | null): TransformResult {
  const cancelRebookPreprocess = preprocessCancelRebookRows(rows);
  const records: ImportRecord[] = [];
  const previewRows: FidelityPreviewRow[] = [];
  const warnings: ImportWarning[] = [...cancelRebookPreprocess.warnings];

  let cancelledCount = cancelRebookPreprocess.cancelledCount;
  let skippedBlankCount = 0;
  let unknownSkippedCount = 0;

  const previewRowByCsvRow = new Map<number, number>();
  const assignmentOptionRows = new Map<string, ExecutionImportRecord[]>();
  const assignmentEquityRows = new Map<string, ExecutionImportRecord[]>();

  const appendWarning = (rowIndex: number, rawAction: string, message: string, code?: string) => {
    warnings.push({ code, rowIndex, rawAction, message });
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
    const cancelRebookDecision = cancelRebookPreprocess.decisions.get(rowArrayIndex);

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

    if (cancelRebookDecision?.dropRow) {
      const preview = makePreviewRow({
        rowIndex: csvRowIndex,
        executionDate: row.runDate,
        actionClassification: classification.kind === "UNKNOWN" ? "SKIPPED" : toActionClassificationString(classification),
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
        warningMessage: cancelRebookDecision.infoMessage,
      });
      previewRowByCsvRow.set(csvRowIndex, previewRows.length);
      previewRows.push(preview);
      return;
    }

    if (classification.kind === "CANCELLED") {
      cancelledCount += 1;
      appendWarning(csvRowIndex, rawAction, "Cancelled row skipped.", "CANCELLED_ROW_SKIPPED");
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
      unknownSkippedCount += 1;
      const message = `Unknown Fidelity action; row skipped: ${rawAction}`;
      appendWarning(csvRowIndex, rawAction, message, "UNKNOWN_ACTION");
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
      cancelRebookCode: cancelRebookDecision?.keepAsCancelRebookRepresentative ? "CANCEL_REBOOK" : null,
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
    cancelRebookInfos: cancelRebookPreprocess.infos,
    cancelledCount,
    cancelRebookOriginalDropCount: cancelRebookPreprocess.cancelRebookOriginalDropCount,
    skippedBlankCount,
    unknownSkippedCount,
  };
}
