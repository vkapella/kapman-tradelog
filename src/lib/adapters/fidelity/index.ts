import type { NormalizedDailyAccountSnapshot } from "../types";
import { buildFidelityImportSnapshot, extractAccountIdFromFilename, parseFidelityCsv } from "./parser";
import { transformFidelityRows } from "./transformer";
import type { ImportRecord, ImportRecordStatus, ImportWarning, TransformResult } from "./types";

export interface ValidationResult {
  total: number;
  byStatus: Record<ImportRecordStatus, number>;
  warningCount: number;
}

export interface FidelityParseResult extends TransformResult {
  accountId: string | null;
  rawRowCount: number;
  snapshots: NormalizedDailyAccountSnapshot[];
}

export class FidelityAdapter {
  public readonly name = "fidelity";
  public readonly displayName = "Fidelity";
  public readonly fileExtensions = [".csv"];

  public parse(buffer: Buffer, filename: string): FidelityParseResult {
    const rows = parseFidelityCsv(buffer, filename);
    const accountId = extractAccountIdFromFilename(filename);
    const transformed = transformFidelityRows(rows, accountId);

    return {
      ...transformed,
      accountId,
      rawRowCount: rows.length,
      snapshots: buildFidelityImportSnapshot(rows, transformed.moneyMarketHolding),
    };
  }

  public validate(records: ImportRecord[]): ValidationResult {
    const byStatus: Record<ImportRecordStatus, number> = {
      VALID: 0,
      WARNING: 0,
      SKIPPED: 0,
      CANCELLED: 0,
    };

    let warningCount = 0;
    for (const record of records) {
      byStatus[record.status] += 1;
      if (record.status === "WARNING") {
        warningCount += 1;
      }
    }

    return {
      total: records.length,
      byStatus,
      warningCount,
    };
  }

  public warningsToMessages(warnings: ImportWarning[]): string[] {
    return warnings.map((warning) => `Row ${warning.rowIndex}: ${warning.message}`);
  }
}

export default FidelityAdapter;
