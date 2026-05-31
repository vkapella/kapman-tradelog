export interface EquityDayAggRow {
  symbol: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number | null;
}

export interface ParseEquityDayAggsResult {
  rows: EquityDayAggRow[];
  invalidRowCount: number;
  duplicateSymbolCount: number;
  missingSymbols: string[];
}

interface HeaderIndex {
  ticker: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

function parseCsvLine(line: string): string[] {
  const cells: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];

    if (char === '"') {
      const next = line[index + 1];
      if (inQuotes && next === '"') {
        current += '"';
        index += 1;
        continue;
      }
      inQuotes = !inQuotes;
      continue;
    }

    if (char === "," && !inQuotes) {
      cells.push(current);
      current = "";
      continue;
    }

    current += char;
  }

  cells.push(current);
  return cells;
}

function normalizeHeader(header: string): string {
  return header.trim().toLowerCase();
}

function findHeaderIndex(headers: string[], candidates: string[]): number {
  for (const candidate of candidates) {
    const index = headers.indexOf(candidate);
    if (index >= 0) {
      return index;
    }
  }

  return -1;
}

function parseHeader(line: string): HeaderIndex {
  const headers = parseCsvLine(line).map(normalizeHeader);

  return {
    ticker: findHeaderIndex(headers, ["ticker", "symbol"]),
    open: findHeaderIndex(headers, ["open", "o"]),
    high: findHeaderIndex(headers, ["high", "h"]),
    low: findHeaderIndex(headers, ["low", "l"]),
    close: findHeaderIndex(headers, ["close", "c"]),
    volume: findHeaderIndex(headers, ["volume", "v"]),
  };
}

function parseNumber(value: string | undefined): number | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();
  if (normalized.length === 0) {
    return null;
  }

  const number = Number(normalized);
  if (!Number.isFinite(number)) {
    return null;
  }

  return number;
}

function hasRequiredIndexes(index: HeaderIndex): boolean {
  return index.ticker >= 0 && index.open >= 0 && index.high >= 0 && index.low >= 0 && index.close >= 0;
}

export function parseEquityDayAggsCsv(csvText: string, includeSymbols: Iterable<string>): ParseEquityDayAggsResult {
  const includeSymbolSet = new Set(
    Array.from(includeSymbols)
      .map((symbol) => symbol.trim().toUpperCase())
      .filter((symbol) => symbol.length > 0),
  );

  const lines = csvText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (lines.length === 0) {
    return {
      rows: [],
      invalidRowCount: 0,
      duplicateSymbolCount: 0,
      missingSymbols: Array.from(includeSymbolSet).sort((left, right) => left.localeCompare(right)),
    };
  }

  const headerIndex = parseHeader(lines[0]);
  if (!hasRequiredIndexes(headerIndex)) {
    return {
      rows: [],
      invalidRowCount: Math.max(0, lines.length - 1),
      duplicateSymbolCount: 0,
      missingSymbols: Array.from(includeSymbolSet).sort((left, right) => left.localeCompare(right)),
    };
  }

  const rowsBySymbol = new Map<string, EquityDayAggRow>();
  let invalidRowCount = 0;
  let duplicateSymbolCount = 0;

  for (let index = 1; index < lines.length; index += 1) {
    const cells = parseCsvLine(lines[index]);
    const symbolRaw = cells[headerIndex.ticker] ?? "";
    const symbol = symbolRaw.trim().toUpperCase();

    if (symbol.length === 0) {
      invalidRowCount += 1;
      continue;
    }

    if (includeSymbolSet.size > 0 && !includeSymbolSet.has(symbol)) {
      continue;
    }

    const open = parseNumber(cells[headerIndex.open]);
    const high = parseNumber(cells[headerIndex.high]);
    const low = parseNumber(cells[headerIndex.low]);
    const close = parseNumber(cells[headerIndex.close]);

    if (open === null || high === null || low === null || close === null) {
      invalidRowCount += 1;
      continue;
    }

    const volume = headerIndex.volume >= 0 ? parseNumber(cells[headerIndex.volume]) : null;
    if (rowsBySymbol.has(symbol)) {
      duplicateSymbolCount += 1;
    }

    rowsBySymbol.set(symbol, {
      symbol,
      open,
      high,
      low,
      close,
      volume,
    });
  }

  const rows = Array.from(rowsBySymbol.values()).sort((left, right) => left.symbol.localeCompare(right.symbol));
  const parsedSymbols = new Set(rows.map((row) => row.symbol));
  const missingSymbols = Array.from(includeSymbolSet)
    .filter((symbol) => !parsedSymbols.has(symbol))
    .sort((left, right) => left.localeCompare(right));

  return {
    rows,
    invalidRowCount,
    duplicateSymbolCount,
    missingSymbols,
  };
}
