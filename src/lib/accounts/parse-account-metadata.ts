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
  // Paper money is declared by the export banner ("exported from the paperMoney
  // platform ... simulated trading environment") or the account type, never by
  // a word appearing somewhere in the statement body: a live corporate
  // statement reads "Account Statement for <id> (Corporate)" with no banner.
  const bannerLine = lines.find((line) => /exported from the paperMoney/i.test(line) || /simulated trading environment/i.test(line));
  const paperMoney = bannerLine !== undefined || /paper|simulated/.test(accountTypeText);

  return {
    accountId,
    label: `${accountTypeText} ${accountId}`,
    broker: "SCHWAB_THINKORSWIM",
    paperMoney,
  };
}
