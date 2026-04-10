export interface ParsedAccountSummary {
  statementDate: Date | null;
  totalCash: number | null;
  netLiquidatingValue: number | null;
}

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
  const normalized = value
    .trim()
    .replace(/^="(.*)"$/, "$1")
    .replace(/^"(.*)"$/, "$1")
    .replace(/[,$"]/g, "");

  if (!normalized) {
    return null;
  }

  const parsed = Number(normalized);
  if (!Number.isFinite(parsed)) {
    return null;
  }

  return parsed;
}

export function parseThinkorswimAccountSummary(csvText: string): ParsedAccountSummary {
  const lines = csvText.replace(/^\uFEFF/, "").split(/\r?\n/);

  let statementDate: Date | null = null;
  let totalCash: number | null = null;
  let netLiquidatingValue: number | null = null;

  const statementLine = lines.find((line) => line.startsWith("Account Statement for "));
  if (statementLine) {
    const dateMatch = statementLine.match(/through\s+(\d{1,2}\/\d{1,2}\/\d{2})/i);
    if (dateMatch) {
      statementDate = parseUsDate(dateMatch[1] ?? "");
    }
  }

  for (const line of lines) {
    const normalized = line.trim().replace(/^"(.*)"$/, "$1");
    const totalCashMatch = normalized.match(/^Total Cash\s+\$?(-?[0-9,]+(?:\.[0-9]{1,2})?)$/i);
    if (!totalCashMatch) {
      continue;
    }

    const parsed = parseCurrency(totalCashMatch[1] ?? "");
    if (parsed !== null) {
      totalCash = parsed;
    }
  }

  let inAccountSummarySection = false;
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === "Account Summary") {
      inAccountSummarySection = true;
      continue;
    }

    if (!inAccountSummarySection || !trimmed) {
      continue;
    }

    const columns = splitCsvLine(line);
    if (columns.length < 2) {
      continue;
    }

    const metricName = (columns[0] ?? "").trim().replace(/^"(.*)"$/, "$1");
    const metricValue = (columns[1] ?? "").trim();

    if (metricName === "Total Cash") {
      const parsed = parseCurrency(metricValue);
      if (parsed !== null) {
        totalCash = parsed;
      }
      continue;
    }

    if (metricName === "Net Liquidating Value") {
      const parsed = parseCurrency(metricValue);
      if (parsed !== null) {
        netLiquidatingValue = parsed;
      }
    }
  }

  return {
    statementDate,
    totalCash,
    netLiquidatingValue,
  };
}
