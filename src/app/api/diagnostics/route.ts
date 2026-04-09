import { detailResponse } from "@/lib/api/responses";
import { prisma } from "@/lib/db/prisma";
import type { DiagnosticsResponse } from "@/types/api";

export async function GET() {
  const [imports, matchedCount, uncategorizedCount, closeCandidateCount, syntheticExpirationCount] = await Promise.all([
    prisma.import.findMany({ select: { warnings: true, parsedRows: true, skippedRows: true } }),
    prisma.matchedLot.count(),
    prisma.setupGroup.count({ where: { tag: "uncategorized" } }),
    prisma.execution.count({
      where: {
        OR: [
          { openingClosingEffect: "TO_CLOSE" },
          { eventType: "ASSIGNMENT" },
          { eventType: "EXERCISE" },
          { eventType: "EXPIRATION_INFERRED" },
        ],
      },
    }),
    prisma.execution.count({ where: { eventType: "EXPIRATION_INFERRED" } }),
  ]);

  const parsedRows = imports.reduce((sum, row) => sum + row.parsedRows, 0);
  const skippedRows = imports.reduce((sum, row) => sum + row.skippedRows, 0);
  const warningSamples: string[] = [];
  const warningsCount = imports.reduce((sum, row) => {
    if (Array.isArray(row.warnings)) {
      for (const warning of row.warnings) {
        if (typeof warning === "object" && warning !== null && "message" in warning) {
          const message = String(warning.message);
          if (warningSamples.length < 10) {
            warningSamples.push(message);
          }
        }
      }
      return sum + row.warnings.length;
    }
    return sum;
  }, 0);

  const totalRows = parsedRows + skippedRows;
  const payload: DiagnosticsResponse = {
    parseCoverage: totalRows === 0 ? 1 : parsedRows / totalRows,
    unsupportedRowCount: skippedRows,
    matchingCoverage: closeCandidateCount === 0 ? 1 : Math.min(1, matchedCount / closeCandidateCount),
    uncategorizedCount,
    warningsCount,
    syntheticExpirationCount,
    warningSamples,
  };

  return detailResponse(payload);
}
