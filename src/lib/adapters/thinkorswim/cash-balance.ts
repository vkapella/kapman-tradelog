import type { NormalizedDailyAccountSnapshot } from "../types";

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

export function parseCashBalanceSnapshots(csvText: string): NormalizedDailyAccountSnapshot[] {
  const lines = csvText.replace(/^\uFEFF/, "").split(/\r?\n/);
  const snapshots: NormalizedDailyAccountSnapshot[] = [];

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

    if (line.startsWith("DATE,TIME,TYPE,REF #,DESCRIPTION")) {
      continue;
    }

    const columns = splitCsvLine(line);
    if (columns.length < 9) {
      continue;
    }

    const rowType = columns[2]?.trim();
    if (rowType !== "BAL") {
      continue;
    }

    const snapshotDate = parseUsDate(columns[0] ?? "");
    const balance = parseCurrency(columns[8] ?? "");

    if (!snapshotDate || balance === null) {
      continue;
    }

    snapshots.push({
      snapshotDate,
      balance,
    });
  }

  return snapshots;
}
