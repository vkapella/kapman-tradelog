import type { DiagnosticCaseReference } from "@/types/api";

export function buildDiagnosticCaseHref(caseRef: DiagnosticCaseReference): string {
  const query = new URLSearchParams({
    case_kind: caseRef.kind,
  });

  if (caseRef.executionId) {
    query.set("execution_id", caseRef.executionId);
  }
  if (caseRef.matchedLotId) {
    query.set("matched_lot_id", caseRef.matchedLotId);
  }
  if (caseRef.setupId) {
    query.set("setup_id", caseRef.setupId);
  }
  if (caseRef.code) {
    query.set("code", caseRef.code);
  }
  if (caseRef.underlyingSymbol) {
    query.set("underlying_symbol", caseRef.underlyingSymbol);
  }
  if (caseRef.lotIds && caseRef.lotIds.length > 0) {
    query.set("lot_ids", caseRef.lotIds.join(","));
  }
  if (caseRef.message) {
    query.set("message", caseRef.message);
  }

  return `/diagnostics?${query.toString()}#case-file`;
}
