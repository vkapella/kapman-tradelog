import { occToCanonical, parseCanonicalOptionInstrumentKey } from "./occ-ticker";

export interface OptionDayAggRow {
  instrumentKey: string;
  occTicker: string;
  underlying: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number | null;
}

export interface ParseOptionDayAggsResult {
  rows: OptionDayAggRow[];
  invalidRowCount: number;
  duplicateContractCount: number;
  missingContracts: string[];
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
  return Number.isFinite(number) ? number : null;
}

function hasRequiredIndexes(index: HeaderIndex): boolean {
  return index.ticker >= 0 && index.open >= 0 && index.high >= 0 && index.low >= 0 && index.close >= 0;
}

function normalizeContractSet(contracts: Iterable<string>): Set<string> {
  return new Set(
    Array.from(contracts)
      .map((contract) => parseCanonicalOptionInstrumentKey(contract).instrumentKey)
      .filter((contract) => contract.length > 0),
  );
}

export function parseOptionDayAggsCsv(csvText: string, includeContracts: Iterable<string>): ParseOptionDayAggsResult {
  const includeContractSet = normalizeContractSet(includeContracts);
  const lines = csvText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (lines.length === 0) {
    return {
      rows: [],
      invalidRowCount: 0,
      duplicateContractCount: 0,
      missingContracts: Array.from(includeContractSet).sort((left, right) => left.localeCompare(right)),
    };
  }

  const headerIndex = parseHeader(lines[0]);
  if (!hasRequiredIndexes(headerIndex)) {
    return {
      rows: [],
      invalidRowCount: Math.max(0, lines.length - 1),
      duplicateContractCount: 0,
      missingContracts: Array.from(includeContractSet).sort((left, right) => left.localeCompare(right)),
    };
  }

  const rowsByInstrumentKey = new Map<string, OptionDayAggRow>();
  let invalidRowCount = 0;
  let duplicateContractCount = 0;

  for (let index = 1; index < lines.length; index += 1) {
    const cells = parseCsvLine(lines[index]);
    const occTickerRaw = cells[headerIndex.ticker] ?? "";

    let parsedTicker: ReturnType<typeof occToCanonical>;
    try {
      parsedTicker = occToCanonical(occTickerRaw);
    } catch {
      invalidRowCount += 1;
      continue;
    }

    if (includeContractSet.size > 0 && !includeContractSet.has(parsedTicker.instrumentKey)) {
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
    if (rowsByInstrumentKey.has(parsedTicker.instrumentKey)) {
      duplicateContractCount += 1;
    }

    rowsByInstrumentKey.set(parsedTicker.instrumentKey, {
      instrumentKey: parsedTicker.instrumentKey,
      occTicker: parsedTicker.occTicker,
      underlying: parsedTicker.underlying,
      open,
      high,
      low,
      close,
      volume,
    });
  }

  const rows = Array.from(rowsByInstrumentKey.values()).sort((left, right) => left.instrumentKey.localeCompare(right.instrumentKey));
  const parsedContracts = new Set(rows.map((row) => row.instrumentKey));
  const missingContracts = Array.from(includeContractSet)
    .filter((contract) => !parsedContracts.has(contract))
    .sort((left, right) => left.localeCompare(right));

  return {
    rows,
    invalidRowCount,
    duplicateContractCount,
    missingContracts,
  };
}
