import type { CashEventRowType, NormalizedCashEvent, NormalizedDailyAccountSnapshot } from "../types";

const KNOWN_SPREAD_LABELS = new Set(["SINGLE", "STOCK", "VERTICAL", "DIAGONAL", "CALENDAR", "COMBO", "CUSTOM"]);

function splitCsvLine(line: string): string[] {
  const columns: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];

    if (character === "\"") {
      const nextCharacter = line[index + 1];
      if (inQuotes && nextCharacter === "\"") {
        current += "\"";
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

function parseUsDate(value: string): Date | null {
  const match = value.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{2})$/);
  if (!match) {
    return null;
  }

  const month = Number(match[1]);
  const day = Number(match[2]);
  const year = 2000 + Number(match[3]);

  return new Date(Date.UTC(year, month - 1, day));
}

function parseTime(value: string): { hours: number; minutes: number; seconds: number } | null {
  const match = value.trim().match(/^(\d{1,2}):(\d{2}):(\d{2})$/);
  if (!match) {
    return null;
  }

  return {
    hours: Number(match[1]),
    minutes: Number(match[2]),
    seconds: Number(match[3]),
  };
}

function parseUsDateTime(dateRaw: string, timeRaw: string): Date | null {
  const date = parseUsDate(dateRaw);
  const time = parseTime(timeRaw);
  if (!date || !time) {
    return null;
  }

  return new Date(
    Date.UTC(
      date.getUTCFullYear(),
      date.getUTCMonth(),
      date.getUTCDate(),
      time.hours,
      time.minutes,
      time.seconds,
    ),
  );
}

function parseCurrency(value: string): number | null {
  const normalized = value.trim().replace(/^="(.*)"$/, "$1").replace(/[,$"]/g, "");
  if (!normalized) {
    return null;
  }

  const parsed = Number(normalized);
  if (!Number.isFinite(parsed)) {
    return null;
  }

  return parsed;
}

function parseRefNumber(value: string): string {
  const withoutEquals = value.trim().replace(/^=/, "");
  const unwrapped = withoutEquals.replace(/^"(.*)"$/, "$1");
  return unwrapped === "--" ? "" : unwrapped;
}

function parseDescription(value: string): string {
  return value.trim().replace(/^(tIPAD|tIP)\s*[:\-]?\s*/i, "");
}

function parseTradePrice(description: string): string | null {
  const match = description.trim().match(/@\s*([0-9]+(?:\.[0-9]+)?|\.[0-9]+)\s*$/i);
  return match ? match[1] : null;
}

interface ParsedTradeDescriptor {
  side: "BUY" | "SELL";
  quantity: number;
  symbol: string;
  optionType: "CALL" | "PUT" | null;
  price: string | null;
}

function parseTradeDescriptor(description: string): ParsedTradeDescriptor | null {
  const normalizedDescription = parseDescription(description);
  const actionMatch = normalizedDescription.match(/^(BOT|SOLD)\s+([+-]?\d+)\s+(.+)$/i);
  if (!actionMatch) {
    return null;
  }

  const quantity = Math.abs(Number(actionMatch[2]));
  if (!Number.isFinite(quantity) || quantity <= 0) {
    return null;
  }

  const details = actionMatch[3]?.trim() ?? "";
  if (!details) {
    return null;
  }

  const detailsWithoutPrice = details.replace(/@\s*([0-9]+(?:\.[0-9]+)?|\.[0-9]+)\s*$/i, "").trim();
  const tokens = detailsWithoutPrice.split(/\s+/).filter((token) => token.length > 0);
  if (tokens.length === 0) {
    return null;
  }

  const startsWithSpreadLabel = KNOWN_SPREAD_LABELS.has(tokens[0]?.toUpperCase() ?? "");
  const symbolToken = startsWithSpreadLabel ? tokens[1] : tokens[0];
  if (!symbolToken) {
    return null;
  }

  const upperTokens = tokens.map((token) => token.toUpperCase());
  const optionType = upperTokens.includes("CALL") ? "CALL" : upperTokens.includes("PUT") ? "PUT" : null;

  return {
    side: actionMatch[1]?.toUpperCase() === "BOT" ? "BUY" : "SELL",
    quantity,
    symbol: symbolToken.toUpperCase(),
    optionType,
    price: parseTradePrice(details),
  };
}

function readRowColumns(columns: string[]) {
  const firstCellEmpty = (columns[0] ?? "").trim() === "";
  const firstDate = parseUsDate(columns[0] ?? "");
  const secondDate = parseUsDate(columns[1] ?? "");
  const offset = firstCellEmpty && firstDate === null && secondDate !== null ? 1 : 0;

  return {
    dateRaw: columns[offset] ?? "",
    timeRaw: columns[offset + 1] ?? "",
    rowTypeRaw: columns[offset + 2] ?? "",
    refRaw: columns[offset + 3] ?? "",
    descriptionRaw: columns[offset + 4] ?? "",
    amountRaw: columns[offset + 7] ?? "",
    balanceRaw: columns[offset + 8] ?? "",
  };
}

export interface ParsedCashBalanceRows {
  snapshots: NormalizedDailyAccountSnapshot[];
  cashEvents: NormalizedCashEvent[];
  tradeReferences: ParsedCashTradeReference[];
}

export interface ParsedCashTradeReference {
  eventTimestamp: Date;
  refNumber: string;
  side: "BUY" | "SELL";
  quantity: number;
  symbol: string;
  optionType: "CALL" | "PUT" | null;
  price: string | null;
}

export function parseCashBalanceRows(csvText: string): ParsedCashBalanceRows {
  const lines = csvText.replace(/^\uFEFF/, "").split(/\r?\n/);
  const snapshots: NormalizedDailyAccountSnapshot[] = [];
  const cashEvents: NormalizedCashEvent[] = [];
  const tradeReferences: ParsedCashTradeReference[] = [];

  let inCashBalanceSection = false;

  for (const line of lines) {
    if (line.trim() === "Cash Balance") {
      inCashBalanceSection = true;
      continue;
    }

    if (!inCashBalanceSection) {
      continue;
    }

    if (!line.trim()) {
      continue;
    }

    if (line.startsWith("Account Order History") || line.startsWith("Account Trade History")) {
      break;
    }

    if (line.includes("DATE,TIME,TYPE,REF #,DESCRIPTION")) {
      continue;
    }

    const columns = splitCsvLine(line);
    if (columns.length < 9) {
      continue;
    }

    const { dateRaw, timeRaw, rowTypeRaw, refRaw, descriptionRaw, amountRaw, balanceRaw } = readRowColumns(columns);
    const rowType = rowTypeRaw.trim().toUpperCase();

    if (rowType === "BAL") {
      const snapshotDate = parseUsDate(dateRaw);
      const balance = parseCurrency(balanceRaw);

      if (!snapshotDate || balance === null) {
        continue;
      }

      snapshots.push({
        snapshotDate,
        balance,
      });

      continue;
    }

    if (rowType !== "FND" && rowType !== "LIQ" && rowType !== "RAD") {
      if (rowType !== "TRD") {
        continue;
      }

      const eventTimestamp = parseUsDateTime(dateRaw, timeRaw);
      const refNumber = parseRefNumber(refRaw);
      const tradeDescriptor = parseTradeDescriptor(descriptionRaw);

      if (!eventTimestamp || !refNumber || !tradeDescriptor) {
        continue;
      }

      tradeReferences.push({
        eventTimestamp,
        refNumber,
        side: tradeDescriptor.side,
        quantity: tradeDescriptor.quantity,
        symbol: tradeDescriptor.symbol,
        optionType: tradeDescriptor.optionType,
        price: tradeDescriptor.price,
      });
      continue;
    }

    const eventDate = parseUsDate(dateRaw);
    const amount = parseCurrency(amountRaw);
    const refNumber = parseRefNumber(refRaw);
    const description = parseDescription(descriptionRaw);

    if (!eventDate || amount === null || !refNumber) {
      continue;
    }

    cashEvents.push({
      eventDate,
      rowType: rowType as CashEventRowType,
      refNumber,
      description,
      amount,
    });
  }

  return { snapshots, cashEvents, tradeReferences };
}

export function parseCashBalanceSnapshots(csvText: string): NormalizedDailyAccountSnapshot[] {
  return parseCashBalanceRows(csvText).snapshots;
}

export function parseCashBalanceEvents(csvText: string): NormalizedCashEvent[] {
  return parseCashBalanceRows(csvText).cashEvents;
}
