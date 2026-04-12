import type {
  DiagnosticCaseFileResponse,
  DiagnosticGroupRecord,
  ExecutionRecord,
  MatchedLotRecord,
  SetupSummaryRecord,
} from "@/types/api";

export interface StoredDiagnosticWarning {
  code: string;
  message: string;
  accountId?: string;
  rowRef?: string;
}

export interface WarningGroupingContext {
  unmatchedCloseExecutionIdByAccountInstrumentKey?: Map<string, string>;
  syntheticExecutionIdByAccountInstrumentKey?: Map<string, string>;
}

export interface SetupInferenceSampleLike {
  code: string;
  message: string;
  underlyingSymbol: string;
  lotIds: string[];
}

function titleCaseToken(value: string): string {
  return value
    .toLowerCase()
    .split("_")
    .filter(Boolean)
    .map((token) => token.charAt(0).toUpperCase() + token.slice(1))
    .join(" ");
}

function extractInstrumentKey(message: string): string | null {
  const unmatched = message.match(/instrument\s+(.+?)\./i);
  if (unmatched?.[1]) {
    return unmatched[1];
  }

  const synthetic = message.match(/for\s+(.+?)\s+quantity/i);
  if (synthetic?.[1]) {
    return synthetic[1];
  }

  return null;
}

export function buildAccountInstrumentKey(accountId: string, instrumentKey: string): string {
  return `${accountId}::${instrumentKey}`;
}

function buildWarningGroupTitle(code: string): string {
  switch (code) {
    case "UNMATCHED_CLOSE_QUANTITY":
      return "Unmatched Close Quantity";
    case "SYNTHETIC_EXPIRATION_INFERRED":
      return "Synthetic Expiration Inferred";
    case "SETUP_UNCATEGORIZED_COUNT":
      return "Uncategorized Setups";
    default:
      return titleCaseToken(code);
  }
}

function buildSetupInferenceGroupTitle(code: string): string {
  switch (code) {
    case "PAIR_FAIL_NO_OVERLAP_LONG_CALL":
      return "No Overlapping Long Call";
    case "PAIR_FAIL_NO_ELIGIBLE_EXP":
      return "No Eligible Expiration Pair";
    case "PAIR_FAIL_MISSING_METADATA":
      return "Missing Pairing Metadata";
    case "PAIR_AMBIGUOUS":
      return "Ambiguous Pairing";
    case "ANCHOR_TAG_AMBIGUOUS":
      return "Ambiguous Anchor Tag";
    default:
      return titleCaseToken(code);
  }
}

export function groupWarningRecords(
  warnings: StoredDiagnosticWarning[],
  context: WarningGroupingContext = {},
): DiagnosticGroupRecord[] {
  const grouped = new Map<string, { warning: StoredDiagnosticWarning; count: number; instrumentKey: string | null }>();

  for (const warning of warnings) {
    const instrumentKey = extractInstrumentKey(warning.message);
    const scopeToken = warning.accountId ?? "NO_ACCOUNT";
    const groupKey =
      warning.code === "UNMATCHED_CLOSE_QUANTITY" || warning.code === "SYNTHETIC_EXPIRATION_INFERRED"
        ? `${warning.code}:${scopeToken}:${instrumentKey ?? warning.message}`
        : `${warning.code}:${scopeToken}:${warning.message}`;
    const existing = grouped.get(groupKey);
    if (existing) {
      existing.count += 1;
      continue;
    }

    grouped.set(groupKey, {
      warning,
      count: 1,
      instrumentKey,
    });
  }

  return Array.from(grouped.entries()).map(([id, entry]) => {
    let caseRef: DiagnosticGroupRecord["caseRef"] = null;
    if (entry.warning.code === "UNMATCHED_CLOSE_QUANTITY" && entry.instrumentKey) {
      const scopedInstrumentKey = entry.warning.accountId ? buildAccountInstrumentKey(entry.warning.accountId, entry.instrumentKey) : entry.instrumentKey;
      const executionId = context.unmatchedCloseExecutionIdByAccountInstrumentKey?.get(scopedInstrumentKey) ?? null;
      caseRef = executionId ? { kind: "execution", executionId } : null;
    }

    if (entry.warning.code === "SYNTHETIC_EXPIRATION_INFERRED" && entry.instrumentKey) {
      const scopedInstrumentKey = entry.warning.accountId ? buildAccountInstrumentKey(entry.warning.accountId, entry.instrumentKey) : entry.instrumentKey;
      const executionId = context.syntheticExecutionIdByAccountInstrumentKey?.get(scopedInstrumentKey) ?? null;
      caseRef = executionId ? { kind: "execution", executionId } : null;
    }

    return {
      id,
      code: entry.warning.code,
      title: buildWarningGroupTitle(entry.warning.code),
      count: entry.count,
      summary: entry.warning.message,
      underlyingSymbol: null,
      caseRef,
    };
  });
}

export function groupSetupInferenceSamples(samples: SetupInferenceSampleLike[]): DiagnosticGroupRecord[] {
  const grouped = new Map<string, { sample: SetupInferenceSampleLike; count: number }>();

  for (const sample of samples) {
    const key = `${sample.code}:${sample.underlyingSymbol}`;
    const existing = grouped.get(key);
    if (existing) {
      existing.count += 1;
      continue;
    }

    grouped.set(key, {
      sample,
      count: 1,
    });
  }

  return Array.from(grouped.entries()).map(([id, entry]) => ({
    id,
    code: entry.sample.code,
    title: buildSetupInferenceGroupTitle(entry.sample.code),
    count: entry.count,
    summary: entry.sample.message,
    underlyingSymbol: entry.sample.underlyingSymbol,
    caseRef: {
      kind: "setup_inference",
      code: entry.sample.code,
      underlyingSymbol: entry.sample.underlyingSymbol,
      lotIds: entry.sample.lotIds,
      message: entry.sample.message,
    },
  }));
}

function dedupeById<T extends { id: string }>(rows: T[]): T[] {
  const seen = new Set<string>();
  const deduped: T[] = [];

  for (const row of rows) {
    if (seen.has(row.id)) {
      continue;
    }

    seen.add(row.id);
    deduped.push(row);
  }

  return deduped;
}

function sortExecutions(rows: ExecutionRecord[]): ExecutionRecord[] {
  return [...rows].sort((left, right) => {
    const timestampDiff = new Date(left.eventTimestamp).getTime() - new Date(right.eventTimestamp).getTime();
    if (timestampDiff !== 0) {
      return timestampDiff;
    }

    return left.id.localeCompare(right.id);
  });
}

function sortMatchedLots(rows: MatchedLotRecord[]): MatchedLotRecord[] {
  return [...rows].sort((left, right) => left.id.localeCompare(right.id));
}

function sortSetups(rows: SetupSummaryRecord[]): SetupSummaryRecord[] {
  return [...rows].sort((left, right) => left.id.localeCompare(right.id));
}

export function buildExecutionCaseFile(input: {
  execution: ExecutionRecord;
  relatedExecutions: ExecutionRecord[];
  matchedLots: MatchedLotRecord[];
  setups: SetupSummaryRecord[];
  rawAction: string | null;
  evidence?: Array<{ label: string; value: string }>;
}): DiagnosticCaseFileResponse {
  const diagnosticCode =
    input.execution.eventType === "EXPIRATION_INFERRED"
      ? "EXPIRATION_INFERRED"
      : input.execution.openingClosingEffect === null || input.execution.openingClosingEffect === "UNKNOWN"
        ? "UNKNOWN_EFFECT"
        : "EXECUTION_TRACE";
  const title =
    diagnosticCode === "EXPIRATION_INFERRED"
      ? "Synthetic Expiration Case File"
      : diagnosticCode === "UNKNOWN_EFFECT"
        ? "Unknown Effect Case File"
        : "Execution Case File";
  const summary =
    diagnosticCode === "EXPIRATION_INFERRED"
      ? "Synthetic close created because an option lot remained open after expiration."
      : diagnosticCode === "UNKNOWN_EFFECT"
        ? "Execution is missing a resolved opening/closing effect."
        : "Execution lineage across T1, T2, and T3.";

  const evidence = [...(input.evidence ?? [])];
  if (input.rawAction) {
    evidence.push({ label: "Raw action", value: input.rawAction });
  }
  if (diagnosticCode === "UNKNOWN_EFFECT") {
    evidence.push({
      label: "Effect explanation",
      value: "Current stored fields do not support resolving this execution to TO_OPEN or TO_CLOSE.",
    });
  }

  return {
    target: {
      kind: "execution",
      diagnosticCode,
      title,
      summary,
      underlyingSymbol: input.execution.underlyingSymbol,
    },
    focusExecutionId: input.execution.id,
    focusMatchedLotId: input.matchedLots[0]?.id ?? null,
    focusSetupId: input.setups[0]?.id ?? null,
    executions: sortExecutions(dedupeById([input.execution, ...input.relatedExecutions])),
    matchedLots: sortMatchedLots(dedupeById(input.matchedLots)),
    setups: sortSetups(dedupeById(input.setups)),
    inferenceReasons: [],
    evidence,
  };
}

export function buildMatchedLotCaseFile(input: {
  matchedLot: MatchedLotRecord;
  executions: ExecutionRecord[];
  setups: SetupSummaryRecord[];
  evidence?: Array<{ label: string; value: string }>;
}): DiagnosticCaseFileResponse {
  return {
    target: {
      kind: "matched_lot",
      diagnosticCode: "MATCHED_LOT_TRACE",
      title: "Matched Lot Case File",
      summary: "Trace a FIFO-matched lot back to its open and close executions and any containing setups.",
      underlyingSymbol: input.matchedLot.underlyingSymbol ?? input.matchedLot.symbol,
    },
    focusExecutionId: input.matchedLot.closeExecutionId ?? input.matchedLot.openExecutionId,
    focusMatchedLotId: input.matchedLot.id,
    focusSetupId: input.setups[0]?.id ?? null,
    executions: sortExecutions(dedupeById(input.executions)),
    matchedLots: [input.matchedLot],
    setups: sortSetups(dedupeById(input.setups)),
    inferenceReasons: [],
    evidence: input.evidence ?? [],
  };
}

export function buildSetupCaseFile(input: {
  setup: SetupSummaryRecord;
  matchedLots: MatchedLotRecord[];
  executions: ExecutionRecord[];
  inferenceReasons: string[];
  evidence?: Array<{ label: string; value: string }>;
}): DiagnosticCaseFileResponse {
  return {
    target: {
      kind: "setup",
      diagnosticCode: "SETUP_TRACE",
      title: "Setup Case File",
      summary: "Trace a setup group to its contributing matched lots and source executions.",
      underlyingSymbol: input.setup.underlyingSymbol,
    },
    focusExecutionId: input.executions[0]?.id ?? null,
    focusMatchedLotId: input.matchedLots[0]?.id ?? null,
    focusSetupId: input.setup.id,
    executions: sortExecutions(dedupeById(input.executions)),
    matchedLots: sortMatchedLots(dedupeById(input.matchedLots)),
    setups: [input.setup],
    inferenceReasons: input.inferenceReasons,
    evidence: input.evidence ?? [],
  };
}

export function buildSetupInferenceCaseFile(input: {
  code: string;
  message: string;
  underlyingSymbol: string;
  executions: ExecutionRecord[];
  matchedLots: MatchedLotRecord[];
  setups: SetupSummaryRecord[];
  inferenceReasons: string[];
  evidence?: Array<{ label: string; value: string }>;
}): DiagnosticCaseFileResponse {
  return {
    target: {
      kind: "setup_inference",
      diagnosticCode: input.code,
      title: buildSetupInferenceGroupTitle(input.code),
      summary: input.message,
      underlyingSymbol: input.underlyingSymbol,
    },
    focusExecutionId: input.executions[0]?.id ?? null,
    focusMatchedLotId: input.matchedLots[0]?.id ?? null,
    focusSetupId: input.setups[0]?.id ?? null,
    executions: sortExecutions(dedupeById(input.executions)),
    matchedLots: sortMatchedLots(dedupeById(input.matchedLots)),
    setups: sortSetups(dedupeById(input.setups)),
    inferenceReasons: input.inferenceReasons,
    evidence: input.evidence ?? [],
  };
}
