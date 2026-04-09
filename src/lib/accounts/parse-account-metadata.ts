import { Broker } from "@prisma/client";

export interface ParsedAccountMetadata {
  accountId: string;
  label: string;
  broker: Broker;
  paperMoney: boolean;
}

export function parseAccountMetadataFromCsv(csvText: string): ParsedAccountMetadata {
  const normalized = csvText.replace(/^\uFEFF/, "");
  const lines = normalized.split(/\r?\n/);
  const accountLine = lines.find((line) => line.startsWith("Account Statement for "));

  if (!accountLine) {
    throw new Error("Unable to locate account metadata line in CSV.");
  }

  const match = accountLine.match(/Account Statement for\s+([^\s]+)\s+\(([^)]+)\)/i);
  if (!match) {
    throw new Error(`Unable to parse account metadata from line: ${accountLine}`);
  }

  const accountId = match[1].trim();
  const accountTypeText = match[2].trim().toLowerCase();
  const paperMoney = /paper|simulated|papermoney/i.test(normalized) || accountTypeText.includes("paper");

  return {
    accountId,
    label: `${accountTypeText} ${accountId}`,
    broker: "SCHWAB_THINKORSWIM",
    paperMoney,
  };
}
