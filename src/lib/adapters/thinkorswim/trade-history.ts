import { parseAccountMetadataFromCsv } from "../../accounts/parse-account-metadata";
import type { AdapterWarning, NormalizedExecution, ParseResult } from "../types";

const TRADE_HISTORY_HEADER = ",Exec Time,Spread,Side,Qty,Pos Effect,Symbol,Exp,Strike,Type,Price,Net Price,Order Type";
const KNOWN_SPREADS = new Set(["SINGLE", "STOCK", "VERTICAL", "DIAGONAL", "CALENDAR", "COMBO", "CUSTOM"]);
const MULTI_LEG_SPREADS = new Set(["VERTICAL", "DIAGONAL", "CALENDAR", "COMBO", "CUSTOM"]);

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

function parseDateTime(value: string): Date | null {
  const match = value.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{2})\s+(\d{1,2}):(\d{2}):(\d{2})$/);
  if (!match) {
    return null;
  }

  return new Date(
    Date.UTC(
      2000 + Number(match[3]),
      Number(match[1]) - 1,
      Number(match[2]),
      Number(match[4]),
      Number(match[5]),
      Number(match[6]),
    ),
  );
}

function parseExpiration(value: string): Date | null {
  const match = value.trim().match(/^(\d{1,2})\s+([A-Z]{3})\s+(\d{2})$/i);
  if (!match) {
    return null;
  }

  const monthMap: Record<string, number> = {
    JAN: 0,
    FEB: 1,
    MAR: 2,
    APR: 3,
    MAY: 4,
    JUN: 5,
    JUL: 6,
    AUG: 7,
    SEP: 8,
    OCT: 9,
    NOV: 10,
    DEC: 11,
  };

  const month = monthMap[match[2].toUpperCase()];
  if (month === undefined) {
    return null;
  }

  return new Date(Date.UTC(2000 + Number(match[3]), month, Number(match[1])));
}

function parseNumber(value: string): number | null {
  const normalized = value.trim().replace(/[,$]/g, "");
  if (!normalized || normalized === "~") {
    return null;
  }

  const parsed = Number(normalized);
  if (!Number.isFinite(parsed)) {
    return null;
  }

  return parsed;
}

function parseNetAmount(value: string): number | null {
  const normalized = value.trim().toUpperCase();
  if (!normalized || normalized === "DEBIT" || normalized === "CREDIT") {
    return null;
  }

  return parseNumber(value);
}

function deriveAssetClass(typeValue: string): "EQUITY" | "OPTION" {
  const normalized = typeValue.trim().toUpperCase();
  return normalized === "CALL" || normalized === "PUT" ? "OPTION" : "EQUITY";
}

function hasContinuation(lines: string[], lineIndex: number): boolean {
  const nextLine = lines[lineIndex + 1];
  if (!nextLine || !nextLine.startsWith(",")) {
    return false;
  }

  const nextColumns = splitCsvLine(nextLine);
  const nextExecTime = (nextColumns[1] ?? "").trim();
  return nextExecTime === "";
}

export function parseThinkorswimTradeHistory(csvText: string): ParseResult {
  const accountMetadata = parseAccountMetadataFromCsv(csvText);
  const lines = csvText.replace(/^\uFEFF/, "").split(/\r?\n/);

  const warnings: AdapterWarning[] = [];
  const executions: NormalizedExecution[] = [];

  const sectionIndex = lines.findIndex((line) => line.trim() === "Account Trade History");
  if (sectionIndex === -1) {
    throw new Error("Account Trade History section not found.");
  }

  const headerLine = lines[sectionIndex + 1] ?? "";
  if (headerLine.trim() !== TRADE_HISTORY_HEADER) {
    throw new Error(`Unexpected Account Trade History header: ${headerLine}`);
  }

  let parsedRows = 0;
  let skippedRows = 0;
  let activeGroupId: string | null = null;
  let activeTimestamp: Date | null = null;

  for (let lineIndex = sectionIndex + 2; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex];

    if (!line) {
      continue;
    }

    if (!line.startsWith(",")) {
      if (line.trim().length > 0) {
        break;
      }
      continue;
    }

    const row = splitCsvLine(line);
    const execTimeRaw = (row[1] ?? "").trim();
    const spreadRaw = (row[2] ?? "").trim().toUpperCase();
    const sideRaw = (row[3] ?? "").trim().toUpperCase();
    const qtyRaw = (row[4] ?? "").trim();
    const posEffectRaw = (row[5] ?? "").trim().toUpperCase();
    const symbolRaw = (row[6] ?? "").trim().toUpperCase();
    const expRaw = (row[7] ?? "").trim();
    const strikeRaw = (row[8] ?? "").trim();
    const typeRaw = (row[9] ?? "").trim().toUpperCase();
    const priceRaw = (row[10] ?? "").trim();
    const netPriceRaw = (row[11] ?? "").trim();

    const continuation = execTimeRaw === "";

    if (!continuation) {
      const timestamp = parseDateTime(execTimeRaw);
      if (!timestamp) {
        skippedRows += 1;
        warnings.push({
          code: "INVALID_EXEC_TIME",
          message: `Could not parse execution timestamp '${execTimeRaw}'.`,
          rowRef: String(lineIndex + 1),
        });
        continue;
      }

      activeTimestamp = timestamp;
      const startsGroup = MULTI_LEG_SPREADS.has(spreadRaw) || hasContinuation(lines, lineIndex);
      activeGroupId = startsGroup ? `${accountMetadata.accountId}-${lineIndex + 1}` : null;
    } else if (!activeTimestamp) {
      skippedRows += 1;
      warnings.push({
        code: "ORPHAN_CONTINUATION",
        message: "Continuation leg encountered without a prior anchor row.",
        rowRef: String(lineIndex + 1),
      });
      continue;
    }

    const effectiveSpread = spreadRaw || "SINGLE";
    if (!KNOWN_SPREADS.has(effectiveSpread)) {
      warnings.push({
        code: "UNKNOWN_SPREAD_TYPE",
        message: `Unknown spread type '${effectiveSpread}' parsed conservatively.`,
        rowRef: String(lineIndex + 1),
      });
    }

    if (effectiveSpread === "COMBO" || effectiveSpread === "CUSTOM") {
      warnings.push({
        code: "LIMITED_SPREAD_INTERPRETATION",
        message: `${effectiveSpread} spread parsed as grouped legs with limited interpretation.`,
        rowRef: String(lineIndex + 1),
      });
    }

    const quantityParsed = parseNumber(qtyRaw);
    if (!quantityParsed || !symbolRaw || (sideRaw !== "BUY" && sideRaw !== "SELL")) {
      skippedRows += 1;
      warnings.push({
        code: "UNSUPPORTED_ROW",
        message: "Row skipped due to missing quantity, symbol, or side.",
        rowRef: String(lineIndex + 1),
      });
      continue;
    }

    const price = parseNumber(priceRaw);
    if (priceRaw === "~") {
      warnings.push({
        code: "PRICE_MARKET_PLACEHOLDER",
        message: "Price '~' interpreted as null.",
        rowRef: String(lineIndex + 1),
      });
    }

    const netAmount = parseNetAmount(netPriceRaw);
    const optionType = typeRaw === "CALL" || typeRaw === "PUT" ? typeRaw : null;
    const expirationDate = optionType ? parseExpiration(expRaw) : null;
    const strike = optionType ? parseNumber(strikeRaw) : null;
    const openingClosingEffect = posEffectRaw === "TO OPEN" ? "TO_OPEN" : posEffectRaw === "TO CLOSE" ? "TO_CLOSE" : "UNKNOWN";

    const execution: NormalizedExecution = {
      eventTimestamp: activeTimestamp!,
      tradeDate: new Date(Date.UTC(activeTimestamp!.getUTCFullYear(), activeTimestamp!.getUTCMonth(), activeTimestamp!.getUTCDate())),
      eventType: "TRADE",
      assetClass: deriveAssetClass(typeRaw),
      symbol: symbolRaw,
      side: sideRaw as "BUY" | "SELL",
      quantity: Math.abs(quantityParsed),
      price,
      grossAmount: price !== null ? Math.abs(quantityParsed) * price : null,
      netAmount,
      openingClosingEffect,
      underlyingSymbol: symbolRaw,
      optionType,
      strike,
      expirationDate,
      spread: effectiveSpread,
      spreadGroupId: continuation ? activeGroupId : activeGroupId,
      sourceRowRef: String(lineIndex + 1),
      rawRowJson: {
        execTime: execTimeRaw || null,
        spread: spreadRaw || null,
        side: sideRaw || null,
        qty: qtyRaw || null,
        posEffect: posEffectRaw || null,
        symbol: symbolRaw || null,
        exp: expRaw || null,
        strike: strikeRaw || null,
        type: typeRaw || null,
        price: priceRaw || null,
        netPrice: netPriceRaw || null,
        orderType: (row[12] ?? "").trim() || null,
      },
    };

    executions.push(execution);
    parsedRows += 1;
  }

  const groupedCalendarSpreads = new Map<string, NormalizedExecution[]>();
  for (const execution of executions) {
    if (execution.spread === "CALENDAR" && execution.spreadGroupId) {
      const entries = groupedCalendarSpreads.get(execution.spreadGroupId) ?? [];
      entries.push(execution);
      groupedCalendarSpreads.set(execution.spreadGroupId, entries);
    }
  }

  const groupedCalendarEntries = Array.from(groupedCalendarSpreads.values());
  for (const entries of groupedCalendarEntries) {
    const strikeCount = new Set(entries.map((entry: NormalizedExecution) => (entry.strike === null ? "null" : String(entry.strike)))).size;
    const normalizedSpread = strikeCount > 1 ? "DIAGONAL" : "CALENDAR";
    for (const entry of entries) {
      entry.spread = normalizedSpread;
    }
  }

  return {
    accountMetadata: {
      accountId: accountMetadata.accountId,
      label: accountMetadata.label,
      paperMoney: accountMetadata.paperMoney,
    },
    warnings,
    executions,
    parsedRows,
    skippedRows,
  };
}
