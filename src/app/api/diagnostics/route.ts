import { detailResponse } from "@/lib/api/responses";
import { prisma } from "@/lib/db/prisma";
import type { DiagnosticsResponse } from "@/types/api";

export async function GET() {
  const [imports, executionCount, matchedCount, uncategorizedCount] = await Promise.all([
    prisma.import.findMany({ select: { warnings: true, parsedRows: true, skippedRows: true } }),
    prisma.execution.count(),
    prisma.matchedLot.count(),
    prisma.setupGroup.count({ where: { tag: "uncategorized" } }),
  ]);

  const parsedRows = imports.reduce((sum, row) => sum + row.parsedRows, 0);
  const skippedRows = imports.reduce((sum, row) => sum + row.skippedRows, 0);
  const warningsCount = imports.reduce((sum, row) => {
    if (Array.isArray(row.warnings)) {
      return sum + row.warnings.length;
    }
    return sum;
  }, 0);

  const totalRows = parsedRows + skippedRows;
  const payload: DiagnosticsResponse = {
    parseCoverage: totalRows === 0 ? 1 : parsedRows / totalRows,
    unsupportedRowCount: skippedRows,
    matchingCoverage: executionCount === 0 ? 1 : Math.min(1, matchedCount / executionCount),
    uncategorizedCount,
    warningsCount,
  };

  return detailResponse(payload);
}
