import type { NormalizedDailyAccountSnapshot } from "../types";
import type { RawFidelityRow } from "./types";

const HEADER_ROW_INDEX = 2;
const DATA_START_INDEX = 3;

const ACCOUNT_ID_FILENAME_PATTERN = /History_for_Account_([A-Z0-9]+)-\d+\.csv$/;

const RUN_DATE_COLUMN = "Run Date";
const ACTION_COLUMN = "Action";
const SYMBOL_COLUMN = "Symbol";
const DESCRIPTION_COLUMN = "Description";
const MARGIN_TYPE_COLUMN = "Type";
const PRICE_COLUMN = "Price ($)";
const QUANTITY_COLUMN = "Quantity";
const COMMISSION_COLUMN = "Commission ($)";
const FEES_COLUMN = "Fees ($)";
const ACCRUED_INTEREST_COLUMN = "Accrued Interest ($)";
const AMOUNT_COLUMN = "Amount ($)";
const CASH_BALANCE_COLUMN = "Cash Balance ($)";
const SETTLEMENT_DATE_COLUMN = "Settlement Date";

function splitCsvLine(line: string): string[] {
  const columns: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];

    if (character === '"') {
      const nextCharacter = line[index + 1];
      if (inQuotes && nextCharacter === '"') {
        current += '"';
        index += 1;
        continue;
      }

      inQuotes = !inQuotes;
      continue;
    }

    if (character === "," && !inQuotes) {
      columns.push(current);
      current = "";
      continue;
    }

    current += character;
  }

  columns.push(current);
  return columns;
}

function parseNumber(raw: string): number | null {
  const value = raw.trim();
  if (!value) {
    return null;
  }

  const parsed = Number(value.replace(/[,$]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function parseDate(raw: string): Date | null {
  const value = raw.trim();
  if (!value) {
    return null;
  }

  const match = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match) {
    return null;
  }

  return new Date(Date.UTC(Number(match[3]), Number(match[1]) - 1, Number(match[2])));
}

function parseMarginType(raw: string): "Cash" | "Margin" | null {
  const value = raw.trim();
  if (value === "Cash" || value === "Margin") {
    return value;
  }

  return null;
}

function readColumn(columns: string[], indexes: Map<string, number>, columnName: string): string {
  const index = indexes.get(columnName);
  if (index === undefined) {
    return "";
  }

  return (columns[index] ?? "").trim();
}

export function extractAccountIdFromFilename(filename: string): string | null {
  const match = filename.match(ACCOUNT_ID_FILENAME_PATTERN);
  return match ? match[1] : null;
}

export function parseFidelityCsv(buffer: Buffer, _filename: string): RawFidelityRow[] {
  const text = buffer.toString("utf8").replace(/^\uFEFF/, "");
  const lines = text.split(/\r?\n/);

  const headerColumns = splitCsvLine(lines[HEADER_ROW_INDEX] ?? "");
  const headerIndexes = new Map<string, number>();
  for (let index = 0; index < headerColumns.length; index += 1) {
    headerIndexes.set(headerColumns[index].trim(), index);
  }

  const rows: RawFidelityRow[] = [];

  for (let lineIndex = DATA_START_INDEX; lineIndex < lines.length; lineIndex += 1) {
    const columns = splitCsvLine(lines[lineIndex] ?? "");

    const runDate = parseDate(readColumn(columns, headerIndexes, RUN_DATE_COLUMN));
    const rawAction = readColumn(columns, headerIndexes, ACTION_COLUMN);
    const symbol = readColumn(columns, headerIndexes, SYMBOL_COLUMN).replace(/^\s+/, "");
    const description = readColumn(columns, headerIndexes, DESCRIPTION_COLUMN);
    const marginType = parseMarginType(readColumn(columns, headerIndexes, MARGIN_TYPE_COLUMN));

    rows.push({
      runDate,
      rawAction,
      symbol,
      description,
      marginType,
      price: parseNumber(readColumn(columns, headerIndexes, PRICE_COLUMN)),
      quantity: parseNumber(readColumn(columns, headerIndexes, QUANTITY_COLUMN)),
      commission: parseNumber(readColumn(columns, headerIndexes, COMMISSION_COLUMN)),
      fees: parseNumber(readColumn(columns, headerIndexes, FEES_COLUMN)),
      accruedInterest: parseNumber(readColumn(columns, headerIndexes, ACCRUED_INTEREST_COLUMN)),
      amount: parseNumber(readColumn(columns, headerIndexes, AMOUNT_COLUMN)),
      cashBalance: parseNumber(readColumn(columns, headerIndexes, CASH_BALANCE_COLUMN)),
      settlementDate: parseDate(readColumn(columns, headerIndexes, SETTLEMENT_DATE_COLUMN)),
    });
  }

  return rows;
}

export function buildFidelityImportSnapshot(
  rows: RawFidelityRow[],
  moneyMarketHolding: number,
): NormalizedDailyAccountSnapshot[] {
  const latestRow = rows.find((row) => row.runDate && row.cashBalance !== null);
  if (!latestRow?.runDate || latestRow.cashBalance === null) {
    return [];
  }

  const snapshotDate = new Date(latestRow.runDate.getTime());
  const balance = latestRow.cashBalance;

  return [
    {
      snapshotDate,
      balance,
      totalCash: balance + moneyMarketHolding,
    },
  ];
}
