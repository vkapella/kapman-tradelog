export type SetupTag =
  | "stock"
  | "long_call"
  | "long_put"
  | "covered_call"
  | "cash_secured_put"
  | "bull_vertical"
  | "bear_vertical"
  | "diagonal"
  | "calendar"
  | "roll"
  | "short_call"
  | "uncategorized";

export interface SetupInferenceLot {
  id: string;
  accountId: string;
  symbol: string;
  underlyingSymbol: string;
  openTradeDate: Date;
  closeTradeDate: Date | null;
  realizedPnl: number;
  holdingDays: number;
  openAssetClass: "EQUITY" | "OPTION" | "CASH" | "OTHER";
  openSide: "BUY" | "SELL" | null;
  optionType: string | null;
  strike: number | null;
  expirationDate: Date | null;
  openSpreadGroupId: string | null;
}

export interface SetupInferenceSample {
  code:
    | "PAIR_FAIL_NO_OVERLAP_LONG_CALL"
    | "PAIR_FAIL_NO_ELIGIBLE_EXP"
    | "PAIR_FAIL_MISSING_METADATA"
    | "PAIR_AMBIGUOUS"
    | "ANCHOR_TAG_AMBIGUOUS";
  message: string;
  underlyingSymbol: string;
  lotIds: string[];
}

export interface SetupInferenceDiagnostics {
  setupInferenceTotal: number;
  setupInferenceUncategorizedTotal: number;
  setupInferenceShortCallStandaloneTotal: number;
  setupInferenceShortCallPairedTotal: number;
  setupInferencePairVerticalTotal: number;
  setupInferencePairCalendarTotal: number;
  setupInferencePairDiagonalTotal: number;
  setupInferencePairFailNoOverlapLongCallTotal: number;
  setupInferencePairFailNoEligibleExpTotal: number;
  setupInferencePairFailMissingMetadataTotal: number;
  setupInferencePairAmbiguousTotal: number;
  setupInferenceSamples: SetupInferenceSample[];
}

export interface InferredSetupGroup {
  accountId: string;
  underlyingSymbol: string;
  tag: SetupTag;
  lotIds: string[];
  realizedPnl: number;
  winRate: number;
  expectancy: number;
  averageHoldDays: number;
  inferenceReasons: string[];
}

export interface SetupInferenceResult {
  groups: InferredSetupGroup[];
  uncategorizedCount: number;
  diagnostics: SetupInferenceDiagnostics;
}

interface LotAtom {
  accountId: string;
  underlyingSymbol: string;
  anchorDate: Date;
  tagHint: SetupTag;
  lots: SetupInferenceLot[];
  reasons: string[];
}

interface PairingCandidate {
  anchorLot: SetupInferenceLot;
  tag: Extract<SetupTag, "bull_vertical" | "bear_vertical" | "calendar" | "diagonal">;
  bucket: "vertical" | "later_exp";
  strikeGap: number;
  expirationGapDays: number;
  anchorOpenTradeDateMs: number;
}

interface PairingResult {
  anchorAtoms: LotAtom[];
  unmatchedShortCalls: SetupInferenceLot[];
  consumedLotIds: Set<string>;
}

const MAX_DIAGNOSTIC_SAMPLES = 20;
const VERTICAL_TAGS: SetupTag[] = ["bull_vertical", "bear_vertical"];

function createEmptyDiagnostics(): SetupInferenceDiagnostics {
  return {
    setupInferenceTotal: 0,
    setupInferenceUncategorizedTotal: 0,
    setupInferenceShortCallStandaloneTotal: 0,
    setupInferenceShortCallPairedTotal: 0,
    setupInferencePairVerticalTotal: 0,
    setupInferencePairCalendarTotal: 0,
    setupInferencePairDiagonalTotal: 0,
    setupInferencePairFailNoOverlapLongCallTotal: 0,
    setupInferencePairFailNoEligibleExpTotal: 0,
    setupInferencePairFailMissingMetadataTotal: 0,
    setupInferencePairAmbiguousTotal: 0,
    setupInferenceSamples: [],
  };
}

function daysBetween(start: Date, end: Date): number {
  const millis = 24 * 60 * 60 * 1000;
  return Math.floor((end.getTime() - start.getTime()) / millis);
}

function dateOnly(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function isSameDate(value: Date | null, other: Date | null): boolean {
  if (!value || !other) {
    return false;
  }

  return dateOnly(value) === dateOnly(other);
}

function sortLotsByOpenDate(lots: SetupInferenceLot[]): SetupInferenceLot[] {
  return [...lots].sort((left, right) => {
    const dateDiff = left.openTradeDate.getTime() - right.openTradeDate.getTime();
    if (dateDiff !== 0) {
      return dateDiff;
    }
    return left.id.localeCompare(right.id);
  });
}

function addDiagnosticSample(diagnostics: SetupInferenceDiagnostics, sample: SetupInferenceSample): void {
  if (diagnostics.setupInferenceSamples.length >= MAX_DIAGNOSTIC_SAMPLES) {
    return;
  }

  diagnostics.setupInferenceSamples.push(sample);
}

function hasRollSignal(lots: SetupInferenceLot[], rollWindowDays: number): boolean {
  const sorted = sortLotsByOpenDate(lots);
  for (const closedLot of sorted) {
    if (!closedLot.closeTradeDate) {
      continue;
    }

    const latestAllowed = new Date(closedLot.closeTradeDate);
    latestAllowed.setUTCDate(latestAllowed.getUTCDate() + rollWindowDays);

    const reopened = sorted.some((candidate) => {
      return (
        candidate.id !== closedLot.id &&
        candidate.symbol === closedLot.symbol &&
        candidate.openTradeDate > closedLot.closeTradeDate! &&
        candidate.openTradeDate <= latestAllowed
      );
    });

    if (reopened) {
      return true;
    }
  }

  return false;
}

function inferVerticalTag(a: SetupInferenceLot, b: SetupInferenceLot): SetupTag {
  if (!a.optionType || !b.optionType || a.optionType !== b.optionType) {
    return "uncategorized";
  }
  if (a.strike === null || b.strike === null || a.strike === b.strike) {
    return "uncategorized";
  }
  if (a.openSide === null || b.openSide === null || a.openSide === b.openSide) {
    return "uncategorized";
  }

  const [lowerStrikeLot, higherStrikeLot] = a.strike < b.strike ? [a, b] : [b, a];

  if (a.optionType === "CALL") {
    if (lowerStrikeLot.openSide === "BUY" && higherStrikeLot.openSide === "SELL") {
      return "bull_vertical";
    }
    if (lowerStrikeLot.openSide === "SELL" && higherStrikeLot.openSide === "BUY") {
      return "bear_vertical";
    }
    return "uncategorized";
  }

  if (lowerStrikeLot.openSide === "SELL" && higherStrikeLot.openSide === "BUY") {
    return "bull_vertical";
  }
  if (lowerStrikeLot.openSide === "BUY" && higherStrikeLot.openSide === "SELL") {
    return "bear_vertical";
  }
  return "uncategorized";
}

function inferSpreadHint(lots: SetupInferenceLot[]): SetupTag {
  const optionLots = lots.filter((lot) => lot.openAssetClass === "OPTION");
  if (optionLots.length !== lots.length || optionLots.length < 2) {
    return "uncategorized";
  }

  const optionTypes = new Set(optionLots.map((lot) => lot.optionType ?? "null"));
  if (optionTypes.size !== 1 || optionLots[0]?.optionType === null) {
    return "uncategorized";
  }

  const strikes = new Set(optionLots.map((lot) => (lot.strike === null ? "null" : String(lot.strike))));
  const expirations = new Set(optionLots.map((lot) => (lot.expirationDate ? dateOnly(lot.expirationDate) : "null")));

  if (strikes.has("null") || expirations.has("null")) {
    return "uncategorized";
  }

  if (expirations.size === 1 && strikes.size === 2) {
    const strikeValues = Array.from(strikes.values()).map((value) => Number(value)).sort((a, b) => a - b);
    const lowerStrike = strikeValues[0] ?? null;
    const higherStrike = strikeValues[1] ?? null;
    if (lowerStrike === null || higherStrike === null) {
      return "uncategorized";
    }

    const lowerBuy = optionLots.find((lot) => lot.strike === lowerStrike && lot.openSide === "BUY");
    const lowerSell = optionLots.find((lot) => lot.strike === lowerStrike && lot.openSide === "SELL");
    const higherBuy = optionLots.find((lot) => lot.strike === higherStrike && lot.openSide === "BUY");
    const higherSell = optionLots.find((lot) => lot.strike === higherStrike && lot.openSide === "SELL");

    if ((lowerBuy && higherSell) || (lowerSell && higherBuy)) {
      return inferVerticalTag(lowerBuy ?? lowerSell!, higherSell ?? higherBuy!);
    }

    return "uncategorized";
  }

  if (strikes.size === 1 && expirations.size === 2) {
    return "calendar";
  }

  if (strikes.size === 2 && expirations.size === 2) {
    return "diagonal";
  }

  return "uncategorized";
}

function inferSingleLotHint(lot: SetupInferenceLot): SetupTag {
  if (lot.openAssetClass === "EQUITY") {
    return "stock";
  }

  if (lot.openAssetClass !== "OPTION") {
    return "uncategorized";
  }

  if (lot.optionType === "CALL" && lot.openSide === "BUY") {
    return "long_call";
  }
  if (lot.optionType === "PUT" && lot.openSide === "BUY") {
    return "long_put";
  }
  if (lot.optionType === "PUT" && lot.openSide === "SELL") {
    return "cash_secured_put";
  }
  if (lot.optionType === "CALL" && lot.openSide === "SELL") {
    return "short_call";
  }

  return "uncategorized";
}

function overlapsAt(referenceDate: Date, lot: SetupInferenceLot): boolean {
  if (lot.openTradeDate > referenceDate) {
    return false;
  }

  if (!lot.closeTradeDate) {
    return true;
  }

  return lot.closeTradeDate >= referenceDate;
}

function inferPairTag(
  longCallAnchor: SetupInferenceLot,
  shortCallLot: SetupInferenceLot,
): Extract<SetupTag, "bull_vertical" | "bear_vertical" | "calendar" | "diagonal"> | null {
  if (
    longCallAnchor.strike === null ||
    longCallAnchor.expirationDate === null ||
    shortCallLot.strike === null ||
    shortCallLot.expirationDate === null
  ) {
    return null;
  }

  const sameExpiry = isSameDate(longCallAnchor.expirationDate, shortCallLot.expirationDate);

  if (sameExpiry) {
    if (longCallAnchor.strike === shortCallLot.strike) {
      return null;
    }

    return longCallAnchor.strike < shortCallLot.strike ? "bull_vertical" : "bear_vertical";
  }

  if (longCallAnchor.expirationDate <= shortCallLot.expirationDate) {
    return null;
  }

  if (longCallAnchor.strike === shortCallLot.strike) {
    return "calendar";
  }

  return "diagonal";
}

function buildPairingCandidates(shortCallLot: SetupInferenceLot, anchorLots: SetupInferenceLot[]): PairingCandidate[] {
  const candidates: PairingCandidate[] = [];

  for (const anchorLot of anchorLots) {
    const pairTag = inferPairTag(anchorLot, shortCallLot);
    if (!pairTag) {
      continue;
    }

    const strikeGap = Math.abs((anchorLot.strike ?? 0) - (shortCallLot.strike ?? 0));
    const expirationGapDays =
      anchorLot.expirationDate && shortCallLot.expirationDate
        ? daysBetween(shortCallLot.expirationDate, anchorLot.expirationDate)
        : Number.MAX_SAFE_INTEGER;

    candidates.push({
      anchorLot,
      tag: pairTag,
      bucket: VERTICAL_TAGS.includes(pairTag) ? "vertical" : "later_exp",
      strikeGap,
      expirationGapDays,
      anchorOpenTradeDateMs: anchorLot.openTradeDate.getTime(),
    });
  }

  return candidates;
}

function comparePairingCandidates(left: PairingCandidate, right: PairingCandidate): number {
  if (left.bucket !== right.bucket) {
    return left.bucket === "vertical" ? -1 : 1;
  }

  if (left.bucket === "vertical") {
    if (left.strikeGap !== right.strikeGap) {
      return left.strikeGap - right.strikeGap;
    }

    if (left.anchorOpenTradeDateMs !== right.anchorOpenTradeDateMs) {
      return right.anchorOpenTradeDateMs - left.anchorOpenTradeDateMs;
    }

    return left.anchorLot.id.localeCompare(right.anchorLot.id);
  }

  if (left.expirationGapDays !== right.expirationGapDays) {
    return left.expirationGapDays - right.expirationGapDays;
  }

  if (left.strikeGap !== right.strikeGap) {
    return left.strikeGap - right.strikeGap;
  }

  if (left.anchorOpenTradeDateMs !== right.anchorOpenTradeDateMs) {
    return right.anchorOpenTradeDateMs - left.anchorOpenTradeDateMs;
  }

  return left.anchorLot.id.localeCompare(right.anchorLot.id);
}

function hasPairingAmbiguity(best: PairingCandidate, runnerUp: PairingCandidate | undefined): boolean {
  if (!runnerUp || best.bucket !== runnerUp.bucket) {
    return false;
  }

  if (best.bucket === "vertical") {
    return best.strikeGap === runnerUp.strikeGap && best.anchorOpenTradeDateMs === runnerUp.anchorOpenTradeDateMs;
  }

  return (
    best.expirationGapDays === runnerUp.expirationGapDays &&
    best.strikeGap === runnerUp.strikeGap &&
    best.anchorOpenTradeDateMs === runnerUp.anchorOpenTradeDateMs
  );
}

function resolveAnchorTag(
  pairTags: Array<Extract<SetupTag, "bull_vertical" | "bear_vertical" | "calendar" | "diagonal">>,
  diagnostics: SetupInferenceDiagnostics,
  underlyingSymbol: string,
  lotIds: string[],
): Extract<SetupTag, "bull_vertical" | "bear_vertical" | "calendar" | "diagonal"> {
  if (pairTags.length === 0) {
    return "diagonal";
  }

  const counts = new Map<Extract<SetupTag, "bull_vertical" | "bear_vertical" | "calendar" | "diagonal">, number>();
  for (const tag of pairTags) {
    counts.set(tag, (counts.get(tag) ?? 0) + 1);
  }

  if (counts.size > 1) {
    diagnostics.setupInferencePairAmbiguousTotal += 1;
    addDiagnosticSample(diagnostics, {
      code: "ANCHOR_TAG_AMBIGUOUS",
      message: `Multiple paired spread tags ${Array.from(counts.keys()).join(", ")} for the same anchor. Priority resolution applied.`,
      underlyingSymbol,
      lotIds,
    });
  }

  const priority: Record<Extract<SetupTag, "bull_vertical" | "bear_vertical" | "calendar" | "diagonal">, number> = {
    bull_vertical: 3,
    bear_vertical: 3,
    calendar: 2,
    diagonal: 1,
  };

  const ranked = Array.from(counts.entries()).sort((left, right) => {
    const [leftTag, leftCount] = left;
    const [rightTag, rightCount] = right;

    if (priority[leftTag] !== priority[rightTag]) {
      return priority[rightTag] - priority[leftTag];
    }

    if (leftCount !== rightCount) {
      return rightCount - leftCount;
    }

    return leftTag.localeCompare(rightTag);
  });

  return ranked[0]![0];
}

function buildLongCallAnchorAtoms(lots: SetupInferenceLot[], diagnostics: SetupInferenceDiagnostics): PairingResult {
  const longCalls = sortLotsByOpenDate(
    lots.filter((lot) => lot.openAssetClass === "OPTION" && lot.optionType === "CALL" && lot.openSide === "BUY"),
  );
  const shortCalls = sortLotsByOpenDate(
    lots.filter((lot) => lot.openAssetClass === "OPTION" && lot.optionType === "CALL" && lot.openSide === "SELL"),
  );

  const anchors = new Map<
    string,
    {
      anchorLot: SetupInferenceLot;
      pairedShortCalls: SetupInferenceLot[];
      pairTags: Array<Extract<SetupTag, "bull_vertical" | "bear_vertical" | "calendar" | "diagonal">>;
      reasons: string[];
    }
  >();

  for (const longCallLot of longCalls) {
    anchors.set(longCallLot.id, {
      anchorLot: longCallLot,
      pairedShortCalls: [],
      pairTags: [],
      reasons: [],
    });
  }

  const pairedShortCallIds = new Set<string>();

  for (const shortCallLot of shortCalls) {
    if (shortCallLot.expirationDate === null || shortCallLot.strike === null) {
      diagnostics.setupInferencePairFailMissingMetadataTotal += 1;
      addDiagnosticSample(diagnostics, {
        code: "PAIR_FAIL_MISSING_METADATA",
        message: "Short call could not be paired because strike or expiration is missing.",
        underlyingSymbol: shortCallLot.underlyingSymbol,
        lotIds: [shortCallLot.id],
      });
      continue;
    }

    const overlappingLongCalls = longCalls.filter((longCallLot) => overlapsAt(shortCallLot.openTradeDate, longCallLot));

    if (overlappingLongCalls.length === 0) {
      diagnostics.setupInferencePairFailNoOverlapLongCallTotal += 1;
      addDiagnosticSample(diagnostics, {
        code: "PAIR_FAIL_NO_OVERLAP_LONG_CALL",
        message: "No overlapping long call anchor was open when this short call opened.",
        underlyingSymbol: shortCallLot.underlyingSymbol,
        lotIds: [shortCallLot.id],
      });
      continue;
    }

    const candidates = buildPairingCandidates(shortCallLot, overlappingLongCalls).sort(comparePairingCandidates);

    if (candidates.length === 0) {
      const hasMissingAnchorMetadata = overlappingLongCalls.some((candidate) => candidate.expirationDate === null || candidate.strike === null);
      if (hasMissingAnchorMetadata) {
        diagnostics.setupInferencePairFailMissingMetadataTotal += 1;
        addDiagnosticSample(diagnostics, {
          code: "PAIR_FAIL_MISSING_METADATA",
          message: "Overlapping long call anchors exist but are missing strike or expiration.",
          underlyingSymbol: shortCallLot.underlyingSymbol,
          lotIds: [shortCallLot.id, ...overlappingLongCalls.map((lot) => lot.id)],
        });
      } else {
        diagnostics.setupInferencePairFailNoEligibleExpTotal += 1;
        addDiagnosticSample(diagnostics, {
          code: "PAIR_FAIL_NO_ELIGIBLE_EXP",
          message: "Overlapping long call anchors exist but none satisfy vertical/calendar/diagonal expiration rules.",
          underlyingSymbol: shortCallLot.underlyingSymbol,
          lotIds: [shortCallLot.id, ...overlappingLongCalls.map((lot) => lot.id)],
        });
      }
      continue;
    }

    const bestCandidate = candidates[0]!;
    if (hasPairingAmbiguity(bestCandidate, candidates[1])) {
      diagnostics.setupInferencePairAmbiguousTotal += 1;
      addDiagnosticSample(diagnostics, {
        code: "PAIR_AMBIGUOUS",
        message: "Multiple anchor candidates had equal pairing score. Deterministic tie-breaker selected one.",
        underlyingSymbol: shortCallLot.underlyingSymbol,
        lotIds: [shortCallLot.id, bestCandidate.anchorLot.id, candidates[1]!.anchorLot.id],
      });
    }

    const anchor = anchors.get(bestCandidate.anchorLot.id);
    if (!anchor) {
      continue;
    }

    pairedShortCallIds.add(shortCallLot.id);
    anchor.pairedShortCalls.push(shortCallLot);
    anchor.pairTags.push(bestCandidate.tag);

    if (VERTICAL_TAGS.includes(bestCandidate.tag)) {
      diagnostics.setupInferencePairVerticalTotal += 1;
    } else if (bestCandidate.tag === "calendar") {
      diagnostics.setupInferencePairCalendarTotal += 1;
    } else {
      diagnostics.setupInferencePairDiagonalTotal += 1;
    }

    diagnostics.setupInferenceShortCallPairedTotal += 1;

    anchor.reasons.push(
      `Paired short call lot ${shortCallLot.id} to long call anchor ${bestCandidate.anchorLot.id} as ${bestCandidate.tag}.`,
    );
  }

  const anchorAtoms: LotAtom[] = [];

  for (const entry of Array.from(anchors.values())) {
    const sortedPairedShortCalls = sortLotsByOpenDate(entry.pairedShortCalls);
    const allLotIds = [entry.anchorLot.id, ...sortedPairedShortCalls.map((lot) => lot.id)];
    const tagHint =
      sortedPairedShortCalls.length === 0
        ? "long_call"
        : resolveAnchorTag(entry.pairTags, diagnostics, entry.anchorLot.underlyingSymbol, allLotIds);

    const reasons =
      sortedPairedShortCalls.length === 0
        ? ["No short-call leg pairing was detected for this long-call anchor."]
        : [
            `Long-call anchor absorbed ${sortedPairedShortCalls.length} short-call leg(s); resolved tag ${tagHint}.`,
            ...entry.reasons,
          ];

    anchorAtoms.push({
      accountId: entry.anchorLot.accountId,
      underlyingSymbol: entry.anchorLot.underlyingSymbol,
      anchorDate: entry.anchorLot.openTradeDate,
      tagHint,
      lots: [entry.anchorLot, ...sortedPairedShortCalls],
      reasons,
    });
  }

  const unmatchedShortCalls = shortCalls.filter((shortCallLot) => !pairedShortCallIds.has(shortCallLot.id));
  const consumedLotIds = new Set<string>([
    ...longCalls.map((lot) => lot.id),
    ...Array.from(pairedShortCallIds.values()),
  ]);

  return {
    anchorAtoms,
    unmatchedShortCalls,
    consumedLotIds,
  };
}

function buildAtoms(lots: SetupInferenceLot[], diagnostics: SetupInferenceDiagnostics): LotAtom[] {
  const atoms: LotAtom[] = [];
  const consumedLotIds = new Set<string>();

  const spreadGroups = new Map<string, SetupInferenceLot[]>();
  for (const lot of lots) {
    if (!lot.openSpreadGroupId) {
      continue;
    }

    const entries = spreadGroups.get(lot.openSpreadGroupId) ?? [];
    entries.push(lot);
    spreadGroups.set(lot.openSpreadGroupId, entries);
  }

  for (const [spreadGroupId, spreadLots] of Array.from(spreadGroups.entries())) {
    if (spreadLots.length < 2) {
      continue;
    }

    const inferredTag = inferSpreadHint(spreadLots);
    if (!VERTICAL_TAGS.includes(inferredTag) && inferredTag !== "calendar" && inferredTag !== "diagonal") {
      continue;
    }

    const sortedSpreadLots = sortLotsByOpenDate(spreadLots);
    const anchorDate = sortedSpreadLots[0]!.openTradeDate;
    for (const lot of sortedSpreadLots) {
      consumedLotIds.add(lot.id);
    }

    atoms.push({
      accountId: sortedSpreadLots[0]!.accountId,
      underlyingSymbol: sortedSpreadLots[0]!.underlyingSymbol,
      anchorDate,
      tagHint: inferredTag,
      lots: sortedSpreadLots,
      reasons: [`Spread group ${spreadGroupId} classified as ${inferredTag}.`],
    });
  }

  const remainingLots = lots.filter((lot) => !consumedLotIds.has(lot.id));
  const pairingResult = buildLongCallAnchorAtoms(remainingLots, diagnostics);

  for (const lotId of Array.from(pairingResult.consumedLotIds.values())) {
    consumedLotIds.add(lotId);
  }

  atoms.push(...pairingResult.anchorAtoms);

  for (const shortCallLot of pairingResult.unmatchedShortCalls) {
    atoms.push({
      accountId: shortCallLot.accountId,
      underlyingSymbol: shortCallLot.underlyingSymbol,
      anchorDate: shortCallLot.openTradeDate,
      tagHint: "short_call",
      lots: [shortCallLot],
      reasons: ["No eligible long-call anchor was found for this short-call lot; classified as short_call."],
    });
    consumedLotIds.add(shortCallLot.id);
  }

  for (const lot of remainingLots) {
    if (consumedLotIds.has(lot.id)) {
      continue;
    }

    const tagHint = inferSingleLotHint(lot);
    atoms.push({
      accountId: lot.accountId,
      underlyingSymbol: lot.underlyingSymbol,
      anchorDate: lot.openTradeDate,
      tagHint,
      lots: [lot],
      reasons: [`Single-lot inference classified this lot as ${tagHint}.`],
    });
    consumedLotIds.add(lot.id);
  }

  return atoms;
}

function createClusterMetrics(lots: SetupInferenceLot[]): Pick<InferredSetupGroup, "realizedPnl" | "winRate" | "expectancy" | "averageHoldDays"> {
  const realizedPnl = lots.reduce((sum, lot) => sum + lot.realizedPnl, 0);
  const wins = lots.filter((lot) => lot.realizedPnl > 0).length;
  const expectancy = lots.length > 0 ? realizedPnl / lots.length : 0;
  const averageHoldDays = lots.length > 0 ? lots.reduce((sum, lot) => sum + lot.holdingDays, 0) / lots.length : 0;

  return {
    realizedPnl,
    winRate: lots.length > 0 ? wins / lots.length : 0,
    expectancy,
    averageHoldDays,
  };
}

function clusterAtomsByUnderlyingAndWindow(atoms: LotAtom[], groupingWindowDays: number): LotAtom[][] {
  const byUnderlying = new Map<string, LotAtom[]>();

  for (const atom of atoms) {
    const key = `${atom.accountId}::${atom.underlyingSymbol}`;
    const entries = byUnderlying.get(key) ?? [];
    entries.push(atom);
    byUnderlying.set(key, entries);
  }

  const clusters: LotAtom[][] = [];

  for (const underlyingAtoms of Array.from(byUnderlying.values())) {
    const sorted = [...underlyingAtoms].sort((left, right) => {
      const dateDiff = left.anchorDate.getTime() - right.anchorDate.getTime();
      if (dateDiff !== 0) {
        return dateDiff;
      }
      return left.lots[0]!.id.localeCompare(right.lots[0]!.id);
    });

    let currentCluster: LotAtom[] = [];
    let clusterAnchorDate: Date | null = null;

    for (const atom of sorted) {
      if (!clusterAnchorDate) {
        currentCluster = [atom];
        clusterAnchorDate = atom.anchorDate;
        continue;
      }

      const daysFromAnchor = daysBetween(clusterAnchorDate, atom.anchorDate);
      const rollLinkedToCluster = currentCluster.some((existingAtom) => {
        return existingAtom.lots.some((existingLot) => {
          if (!existingLot.closeTradeDate) {
            return false;
          }

          const rollGapDays = daysBetween(existingLot.closeTradeDate, atom.anchorDate);
          return atom.anchorDate > existingLot.closeTradeDate && rollGapDays <= groupingWindowDays;
        });
      });

      if (daysFromAnchor <= groupingWindowDays || rollLinkedToCluster) {
        currentCluster.push(atom);
        continue;
      }

      clusters.push(currentCluster);
      currentCluster = [atom];
      clusterAnchorDate = atom.anchorDate;
    }

    if (currentCluster.length > 0) {
      clusters.push(currentCluster);
    }
  }

  return clusters;
}

function atomsToLots(atoms: LotAtom[]): SetupInferenceLot[] {
  return atoms.flatMap((atom) => atom.lots);
}

function dedupeReasons(reasons: string[]): string[] {
  return Array.from(new Set(reasons));
}

function createGroupsFromAtomCluster(
  cluster: LotAtom[],
  rollWindowDays: number,
): Array<{ tag: SetupTag; lots: SetupInferenceLot[]; reasons: string[] }> {
  const stockAtoms = cluster.filter((atom) => atom.tagHint === "stock");
  const shortCallAtoms = cluster.filter((atom) => atom.tagHint === "short_call");
  const used = new Set<string>();
  const groups: Array<{ tag: SetupTag; lots: SetupInferenceLot[]; reasons: string[] }> = [];

  if (stockAtoms.length > 0 && shortCallAtoms.length > 0) {
    const coveredCallAtoms = [...stockAtoms, ...shortCallAtoms];
    for (const atom of coveredCallAtoms) {
      for (const lot of atom.lots) {
        used.add(lot.id);
      }
    }

    groups.push({
      tag: "covered_call",
      lots: atomsToLots(coveredCallAtoms),
      reasons: dedupeReasons([
        "Detected stock and short-call activity in the same setup window; grouped as covered_call.",
        ...coveredCallAtoms.flatMap((atom) => atom.reasons),
      ]),
    });
  }

  const remainingAtoms = cluster.filter((atom) => atom.lots.every((lot) => !used.has(lot.id)));
  const byHint = new Map<SetupTag, LotAtom[]>();

  for (const atom of remainingAtoms) {
    const entries = byHint.get(atom.tagHint) ?? [];
    entries.push(atom);
    byHint.set(atom.tagHint, entries);
  }

  for (const [hint, atoms] of Array.from(byHint.entries())) {
    const lots = atomsToLots(atoms);
    const reasons = dedupeReasons(atoms.flatMap((atom) => atom.reasons));

    if (hint === "uncategorized" && hasRollSignal(lots, rollWindowDays)) {
      groups.push({
        tag: "roll",
        lots,
        reasons: dedupeReasons([
          "Uncategorized lots showed close-and-reopen roll signal within the configured window.",
          ...reasons,
        ]),
      });
      continue;
    }

    groups.push({ tag: hint, lots, reasons });
  }

  return groups;
}

export function inferSetupGroups(
  lots: SetupInferenceLot[],
  options?: { groupingWindowDays?: number; rollWindowDays?: number },
): SetupInferenceResult {
  const groupingWindowDays = options?.groupingWindowDays ?? 5;
  const rollWindowDays = options?.rollWindowDays ?? 5;
  const diagnostics = createEmptyDiagnostics();

  const atoms = buildAtoms(lots, diagnostics);
  const clusters = clusterAtomsByUnderlyingAndWindow(atoms, groupingWindowDays);

  const groups: InferredSetupGroup[] = [];

  for (const atomCluster of clusters) {
    const inferredGroups = createGroupsFromAtomCluster(atomCluster, rollWindowDays);
    for (const inferred of inferredGroups) {
      if (inferred.lots.length === 0) {
        continue;
      }

      const metrics = createClusterMetrics(inferred.lots);
      groups.push({
        accountId: inferred.lots[0]!.accountId,
        underlyingSymbol: inferred.lots[0]!.underlyingSymbol,
        tag: inferred.tag,
        lotIds: inferred.lots.map((lot) => lot.id),
        realizedPnl: metrics.realizedPnl,
        winRate: metrics.winRate,
        expectancy: metrics.expectancy,
        averageHoldDays: metrics.averageHoldDays,
        inferenceReasons: inferred.reasons,
      });
    }
  }

  diagnostics.setupInferenceTotal = groups.length;
  diagnostics.setupInferenceUncategorizedTotal = groups.filter((group) => group.tag === "uncategorized").length;
  diagnostics.setupInferenceShortCallStandaloneTotal = groups.filter((group) => group.tag === "short_call").length;

  return {
    groups,
    uncategorizedCount: diagnostics.setupInferenceUncategorizedTotal,
    diagnostics,
  };
}
