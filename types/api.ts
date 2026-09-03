export interface ApiErrorResponse {
  error: {
    code: string;
    message: string;
    details: string[];
  };
}

export interface ApiListMeta {
  total: number;
  page: number;
  pageSize: number;
}

export interface ApiListResponse<T> {
  data: T[];
  meta: ApiListMeta;
}

export interface ApiDetailResponse<T> {
  data: T;
}

export type BrokerId = "schwab_thinkorswim" | "fidelity";
export type ImportStatus = "UPLOADED" | "PARSED" | "COMMITTED" | "FAILED";

export interface LegalEntityRecord {
  slug: string;
  legalName: string;
  kind: "CORPORATION" | "INDIVIDUAL";
}

export interface AccountRecord {
  id: string;
  accountId: string;
  displayLabel: string | null;
  brokerName: string | null;
  startingCapital: string | null;
  paperMoney: boolean;
  /** Legal owner; null = unclassified (quarantined from entity-scoped exports). */
  legalEntity: LegalEntityRecord | null;
  createdAt: string;
}

export interface AccountStartingCapitalSummary {
  total: number;
  byAccount: Record<string, number>;
}

export interface ImportRecord {
  id: string;
  filename: string;
  broker: BrokerId;
  accountId: string;
  status: ImportStatus;
  parsedRows: number;
  inserted: number;
  insertedExecutions: number;
  skipped_duplicate: number;
  failed: number;
  skipped_parse: number;
  createdAt: string;
}

export interface UploadImportResponse {
  importId: string;
  account: {
    accountId: string;
    label: string;
    isNew: boolean;
  };
  detection: {
    adapterId: BrokerId;
    broker: BrokerId;
    confidence: number;
    formatVersion: string;
    rowEstimate: number;
    reason: string;
    warnings: AdapterWarningRecord[];
  };
  previewRows: PreviewRow[];
}

export interface ImportResult {
  parsedRows: number;
  inserted: {
    executions: number;
    cashEvents: number;
  };
  skippedDuplicates: {
    executions: number;
    cashEvents: number;
  };
  failed: number;
}

export interface CommitImportResponse extends ImportResult {
  importId: string;
  accountId: string;
  positionSnapshot: PositionSnapshotComputeResponse | null;
  warnings: string[];
}

export interface DeleteImportResponse {
  importId: string;
  accountId: string;
  status: ImportStatus;
  deleted: {
    importRows: number;
    importExecutionLinks: number;
    executions: number;
    matchedLots: number;
    setupGroups: number;
    snapshots: number;
    cashEvents: number;
    accounts: number;
  };
  reassignedExecutions: number;
  manualAdjustmentsPreserved: number;
  rebuild: {
    ran: boolean;
    matchedLotsPersisted: number;
    syntheticExecutionsPersisted: number;
    setupGroupsPersisted: number;
  };
}

export interface ImportsListQuery {
  accountIds?: string;
  account?: string;
  import?: string;
  page?: number;
  pageSize?: number;
}

export interface ExecutionRecord {
  id: string;
  accountId: string;
  broker: string;
  symbol: string;
  tradeDate: string;
  eventTimestamp: string;
  eventType: string;
  assetClass: string;
  side: string | null;
  quantity: string;
  price: string | null;
  openingClosingEffect: string | null;
  instrumentKey: string | null;
  underlyingSymbol: string | null;
  optionType: string | null;
  strike: string | null;
  expirationDate: string | null;
  spreadGroupId: string | null;
  importId: string;
}

export interface ExecutionDetailRecord extends ExecutionRecord {
  rawRowJson: unknown;
}

export interface ExecutionPreviewRow {
  kind?: "legacy";
  eventTimestamp: string;
  symbol: string;
  side: string;
  quantity: number;
  price: number | null;
  spread: string;
  openingClosingEffect: string;
}

export interface FidelityExecutionPreviewRow {
  kind: "fidelity";
  rowIndex: number;
  executionDate: string | null;
  actionClassification: string;
  symbol: string;
  underlyingTicker: string | null;
  assetClass: "OPTION" | "EQUITY" | "CASH_EVENT" | null;
  side: "BUY" | "SELL" | null;
  openClose: "OPEN" | "CLOSE" | null;
  quantity: number | null;
  price: number | null;
  amount: number | null;
  marginType: "Cash" | "Margin" | null;
  status: "VALID" | "WARNING" | "SKIPPED" | "CANCELLED";
  warningMessage?: string;
}

export type PreviewRow = ExecutionPreviewRow | FidelityExecutionPreviewRow;

export interface ExecutionsListQuery {
  accountIds?: string;
  symbol?: string;
  account?: string;
  import?: string;
  execution?: string;
  date_from?: string;
  date_to?: string;
  page?: number;
  pageSize?: number;
}

export interface CashEventResponse {
  id: string;
  accountId: string;
  eventDate: string;
  rowType: string;
  refNumber: string;
  description: string;
  amount: string;
  createdAt: string;
}

export interface CashEventsListQuery {
  accountId?: string;
  page?: number;
  pageSize?: number;
}

export interface MatchedLotRecord {
  id: string;
  accountId: string;
  symbol: string;
  underlyingSymbol?: string | null;
  openTradeDate: string;
  closeTradeDate: string | null;
  openImportId: string;
  closeImportId: string | null;
  quantity: string;
  realizedPnl: string;
  holdingDays: number;
  outcome: string;
  openExecutionId: string;
  closeExecutionId: string | null;
  excursion?: {
    mfe: string;
    mae: string;
    mfePct: string | null;
    maePct: string | null;
    pricedDays: number;
    unpricedDays: number;
  } | null;
}

export interface MatchedLotsListQuery {
  accountIds?: string;
  symbol?: string;
  outcome?: string;
  account?: string;
  import?: string;
  date_from?: string;
  date_to?: string;
  page?: number;
  pageSize?: number;
}

export interface SetupSummaryRecord {
  id: string;
  accountId: string;
  tag: string;
  overrideTag: string | null;
  underlyingSymbol: string;
  realizedPnl: string | null;
  winRate: string | null;
  expectancy: string | null;
  averageHoldDays: string | null;
  setupLotCount?: number;
  setupOpenDate?: string | null;
  setupCloseDate?: string | null;
}

export interface SetupsListQuery {
  accountIds?: string;
  tag?: string;
  account?: string;
  page?: number;
  pageSize?: number;
}

export interface DiagnosticsQuery {
  accountIds?: string;
}

export interface SetupDetailResponse {
  setup: SetupSummaryRecord;
  lots: MatchedLotRecord[];
  executionIds: string[];
  inference: {
    reasons: string[];
  };
}

export interface OverviewSummaryResponse {
  netPnl: string;
  executionCount: number;
  matchedLotCount: number;
  setupCount: number;
  averageHoldDays: string;
  winRate: string | null;
  totalReturnPct: string | null;
  returnOnCapitalPct: string | null;
  returnOnCapital: {
    beginningValue: string | null;
    endingValue: string | null;
    netExternalContributions: string;
    positiveExternalContributions: string;
    withdrawals: string;
    returnDollars: string | null;
    capitalBase: string | null;
    accountCount: number;
    missingBeginningValueAccountIds: string[];
    missingEndingValueAccountIds: string[];
    endingValueSource: "position_snapshot" | "daily_account_snapshot" | "mixed" | "unavailable";
  };
  profitFactor: string | null;
  expectancy: string | null;
  maxDrawdown: string | null;
  startingCapital: string;
  currentNlv: string | null;
  snapshotCount: number;
  importQuality: {
    totalImports: number;
    committedImports: number;
    failedImports: number;
    parsedRows: number;
    skippedRows: number;
  };
  snapshotSeries: Array<{
    accountId: string;
    snapshotDate: string;
    balance: string;
    totalCash: string | null;
    brokerNetLiquidationValue: string | null;
  }>;
  accountBalances: Array<{
    accountId: string;
    cash: string;
    cashAsOf: string | null;
    brokerNetLiquidationValue: string | null;
  }>;
}

export interface AccountValueSeriesPoint {
  date: string;
  cash: string;
  stockEtf: string;
  options: string;
  total: string;
  brokerNlv: string | null;
  reconcileDelta: string | null;
  unpricedPositionCount: number;
}

export interface AccountValueSeriesResponse {
  points: AccountValueSeriesPoint[];
  meta: {
    accountCount: number;
    startDate: string | null;
    endDate: string | null;
    daysWithUnpriced: number;
    firstTotal: string | null;
    lastTotal: string | null;
  };
}

export interface LotExcursionRecord {
  id: string;
  matchedLotId: string;
  accountId: string;
  symbol: string;
  underlyingSymbol?: string | null;
  setupId: string | null;
  setupTag: string | null;
  openTradeDate: string;
  closeTradeDate: string | null;
  quantity: string;
  realizedPnl: string;
  realizedReturnPct: string | null;
  mfe: string;
  mae: string;
  mfePct: string | null;
  maePct: string | null;
  mfeDate: string | null;
  maeDate: string | null;
  pricedDays: number;
  unpricedDays: number;
  computedAt: string;
}

export interface LotExcursionsListQuery {
  accountIds?: string;
  symbol?: string;
  setupId?: string;
  startDate?: string;
  endDate?: string;
  page?: number;
  pageSize?: number;
}

export interface ReconciliationResponse {
  startingCapital: string;
  startingCapitalConfigured: boolean;
  currentNlv: string;
  totalGain: string;
  unrealizedPnl: string;
  cashAdjustments: string;
  realizedPnl: string;
  manualAdjustments: string;
  unexplainedDelta: string;
  /** The run the figures came from; absent on the legacy exact-scope fallback. */
  runId?: string;
  snapshotAt?: string;
  /** Accounts whose current data revision is ahead of what the run observed. */
  staleAccountIds?: string[];
  source?: "run_accounts" | "legacy_exact_scope" | "empty";
}

export interface TtsEvidenceResponse {
  tradesPerMonth: number;
  activeDaysPerWeek: number;
  averageHoldingPeriodDays: number;
  medianHoldingPeriodDays: number;
  annualizedTradeCount: number;
  grossProceedsProxy: string;
  holdingPeriodDistribution: Array<{
    bucket: string;
    count: number;
  }>;
  monthlySeries: Array<{
    month: string;
    tradeCount: number;
    tradesPerMonth: number;
    activeDaysPerWeek: number;
    averageHoldingPeriodDays: number | null;
    medianHoldingPeriodDays: number | null;
    annualizedTradeCount: number;
    grossProceedsProxy: string;
  }>;
}

export interface DiagnosticsResponse {
  parseCoverage: number;
  unsupportedRowCount: number;
  matchingCoverage: number;
  unmatchedCloseCount: number;
  partialMatchCount: number;
  unmatchedCloseExecutions: Array<{
    id: string;
    symbol: string;
    tradeDate: string;
    qty: string;
    side: string | null;
  }>;
  uncategorizedCount: number;
  warningsCount: number;
  syntheticExpirationCount: number;
  accountCash: Array<{
    accountId: string;
    cashSource: "snapshot" | "value_snapshot" | "heuristic_fallback";
    cashAsOf: string | null;
  }>;
  duplicateSnapshotDateCount: number;
  skippedNonCashSections: {
    forex: number;
    futures: number;
    crypto: number;
  };
  warningSamples: string[];
  warningGroups: DiagnosticGroupRecord[];
  setupInferenceGroups: DiagnosticGroupRecord[];
  setupInference: {
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
    setupInferenceSamples: Array<{
      code: string;
      message: string;
      underlyingSymbol: string;
      lotIds: string[];
    }>;
  };
}

export interface DiagnosticCaseReference {
  kind: "execution" | "matched_lot" | "setup" | "setup_inference";
  executionId?: string;
  matchedLotId?: string;
  setupId?: string;
  code?: string;
  underlyingSymbol?: string | null;
  lotIds?: string[];
  message?: string;
}

export interface DiagnosticGroupRecord {
  id: string;
  code: string;
  title: string;
  count: number;
  summary: string;
  underlyingSymbol: string | null;
  caseRef: DiagnosticCaseReference | null;
}

export interface DiagnosticCaseFileResponse {
  target: {
    kind: "execution" | "matched_lot" | "setup" | "setup_inference";
    diagnosticCode: string;
    title: string;
    summary: string;
    underlyingSymbol: string | null;
  };
  focusExecutionId: string | null;
  focusMatchedLotId: string | null;
  focusSetupId: string | null;
  executions: ExecutionRecord[];
  matchedLots: MatchedLotRecord[];
  setups: SetupSummaryRecord[];
  inferenceReasons: string[];
  evidence: Array<{
    label: string;
    value: string;
  }>;
}

export interface HealthResponse {
  status: "ok" | "degraded";
  db: "connected" | "disconnected";
  /** Product version baked at image build (git describe); "dev" locally. */
  version: string;
  /** Build commit SHA; details-panel only, never the header chip. */
  sha: string | null;
  /** Fly machine id at runtime; omitted from UI when null (decision 06). */
  machineId: string | null;
}

export interface AdapterWarningRecord {
  code: string;
  message: string;
  rowRef?: string;
}

export interface AdapterCoverageRecord {
  equities: boolean;
  options: boolean;
  multiLeg: boolean;
  snapshots: boolean;
  feesFromCashBalance: boolean;
  notes: string;
}

export interface AdapterSummaryRecord {
  id: BrokerId;
  name: BrokerId;
  displayName: string;
  fileExtensions: string[];
  status: "active" | "stub";
  coverage: AdapterCoverageRecord;
}

export interface QuoteUnavailableResponse {
  error: "unavailable";
}

export interface EquityQuoteRecord {
  mark: number;
  bid: number;
  ask: number;
  last: number;
  netChange: number;
  netPctChange: number;
}

export type QuotesResponse = Record<string, EquityQuoteRecord> | QuoteUnavailableResponse;

/// Only `mark` is guaranteed. Analytics fields are nullable so a provider that
/// omits one — common for deep-ITM and long-dated contracts — cannot discard an
/// otherwise valid mark, which is the field valuation actually depends on.
export interface OptionQuoteRecord {
  mark: number;
  bid: number | null;
  ask: number | null;
  delta: number | null;
  theta: number | null;
  iv: number | null;
  dte: number | null;
  inTheMoney: boolean;
}

export type OptionQuoteResponse = OptionQuoteRecord | QuoteUnavailableResponse;

export interface OptionQuoteContractRequest {
  instrumentKey: string;
  symbol: string;
  strike: string;
  expDate: string;
  contractType: "CALL" | "PUT";
}

export interface OptionQuotesRequest {
  contracts: OptionQuoteContractRequest[];
}

export type OptionQuotesMap = Record<string, OptionQuoteResponse>;

export interface OpenPosition {
  symbol: string;
  underlyingSymbol: string;
  assetClass: "OPTION" | "EQUITY";
  optionType: "CALL" | "PUT" | null;
  strike: string | null;
  expirationDate: string | null;
  instrumentKey: string;
  netQty: number;
  costBasis: number;
  accountId: string;
}

export type PositionSnapshotStatus = "PENDING" | "COMPLETE" | "FAILED";

export interface PositionSnapshotOpenPosition extends OpenPosition {
  mark: number | null;
  /// How the mark was obtained. "HISTORICAL" is a daily close standing in for an
  /// unavailable live quote. Optional: older persisted snapshots predate it.
  markSource?: "LIVE" | "HISTORICAL" | null;
  /// Effective date of a historical mark (YYYY-MM-DD); null for a live mark.
  markAsOf?: string | null;
  // Open-leg excursion (daily-mark, since entry). Optional: older persisted snapshots predate it.
  maePct?: number | null;
  mfePct?: number | null;
  pricedDays?: number;
  unpricedDays?: number;
  excursionAsOf?: string | null;
}

export type LiveAccountValueStatus = "CURRENT" | "MIXED_AS_OF" | "STALE_MARKS" | "INCOMPLETE_MARKS";

export interface LiveAccountValue {
  accountId: string;
  accountExternalId: string;
  cashAndEquivalents: string;
  equityMarketValue: string;
  optionMarketValue: string;
  securitiesMarketValue: string;
  reconstructedNlv: string | null;
  brokerReportedNlv: string | null;
  /** Reconstructed NLV minus broker-reported NLV. */
  reconciliationDelta: string | null;
  cashAsOf: string | null;
  marksAsOf: string;
  brokerNlvAsOf: string | null;
  missingMarkCount: number;
  /// Positions priced from a daily close because no live quote was available.
  staleMarkCount: number;
  /// Oldest historical mark date contributing to this value (YYYY-MM-DD).
  staleMarkAsOf: string | null;
  status: LiveAccountValueStatus;
  valuationBasis: "MARK";
  cashSource: "snapshot" | "value_snapshot" | "heuristic_fallback";
  /** Source-data revision the compute observed for this account (string — BigInt
   *  does not survive JSON). Null on legacy rows and non-transactional reads;
   *  consumers must fall back to canonical enqueue precedence, never assume equality. */
  inputsRevision?: string | null;
}

// Client-safe per-position excursion (no prisma); carried in the store's excursions map.
export interface PositionExcursion {
  maePct: number | null;
  mfePct: number | null;
  pricedDays: number;
  unpricedDays: number;
  excursionAsOf: string | null;
}

export interface PositionSnapshotComputeResponse {
  snapshotId: string;
  status: PositionSnapshotStatus;
}

export interface PositionSnapshotResponseData {
  id: string;
  snapshotAt: string;
  createdAt: string;
  /** The account ids the snapshot was actually computed over (its stored scope). */
  scopeAccountIds: string[];
  status: PositionSnapshotStatus;
  errorMessage?: string;
  positions: PositionSnapshotOpenPosition[];
  accountValues: LiveAccountValue[];
  unrealizedPnl: string;
  realizedPnl: string;
  cashAdjustments: string;
  manualAdjustments: string;
  currentNlv: string | null;
  startingCapital: string;
  totalGain: string;
  unexplainedDelta: string;
}

export interface PositionSnapshotResponse {
  data: PositionSnapshotResponseData | null;
  meta: {
    snapshotExists: boolean;
    snapshotAge?: number;
    /** Each scoped account's CURRENT data revision (string), read live at
     *  response time. Comparing against accountValues[].inputsRevision answers
     *  "does this snapshot reflect current data" — the currency check. */
    currentDataRevisions?: Record<string, string>;
  };
}

export interface NlvResult {
  nlv: number | null;
  cash: number;
  cashAsOf: Date | null;
  marksAsOf: Date | null;
  progressReference: number | null;
  lastUpdated: Date | null;
  loading: boolean;
}

export type AdjustmentType =
  | "SPLIT"
  | "QTY_OVERRIDE"
  | "PRICE_OVERRIDE"
  | "ADD_POSITION"
  | "REMOVE_POSITION"
  | "EXECUTION_QTY_OVERRIDE"
  | "EXECUTION_PRICE_OVERRIDE";
export type AdjustmentStatus = "ACTIVE" | "REVERSED";

export interface SplitPayload {
  from: number;
  to: number;
}

export interface QtyOverridePayload {
  instrumentKey: string;
  overrideQty: number;
}

export interface PriceOverridePayload {
  instrumentKey: string;
  overridePrice: number;
}

export interface ExecutionQtyOverridePayload {
  executionId: string;
  overrideQty: number;
}

export interface ExecutionPriceOverridePayload {
  executionId: string;
  overridePrice: number;
}

export interface AddPositionPayload {
  instrumentKey: string;
  assetClass: "EQUITY" | "OPTION";
  netQty: number;
  costBasis: number;
  optionType?: "CALL" | "PUT";
  strike?: string;
  expirationDate?: string;
}

export interface RemovePositionPayload {
  instrumentKey: string;
}

export type ManualAdjustmentPayload =
  | SplitPayload
  | QtyOverridePayload
  | PriceOverridePayload
  | ExecutionQtyOverridePayload
  | ExecutionPriceOverridePayload
  | AddPositionPayload
  | RemovePositionPayload;

export interface ManualAdjustmentRecord {
  id: string;
  createdAt: string;
  createdBy: string;
  accountId: string;
  accountExternalId: string;
  symbol: string;
  effectiveDate: string;
  adjustmentType: AdjustmentType;
  payload: ManualAdjustmentPayload;
  reason: string;
  evidenceRef: string | null;
  status: AdjustmentStatus;
  reversedByAdjustmentId: string | null;
}

export interface CreateManualAdjustmentRequest {
  createdBy?: string;
  accountId: string;
  symbol: string;
  effectiveDate: string;
  adjustmentType: AdjustmentType;
  payload: ManualAdjustmentPayload;
  reason: string;
  evidenceRef?: string;
}

export interface ReverseManualAdjustmentResponse {
  reversedId: string;
  reversalId: string;
}

export interface AccountLedgerRebuildResponse {
  matchedLotsPersisted: number;
  syntheticExecutionsPersisted: number;
  warningsCleared: number;
  setupGroupsPersisted: number;
}

export interface AdjustmentPreviewResponse {
  symbol: string;
  adjustmentType: AdjustmentType;
  warnings: string[];
  before: {
    openQty: number;
    costBasisPerShare: number | null;
    grossCost: number;
  };
  after: {
    openQty: number;
    costBasisPerShare: number | null;
    grossCost: number;
  };
  affectedExecutionCount: number;
  effectiveDate: string;
  executionQtyOverridePreview?: {
    executionId: string;
    rawQty: number;
    beforeEffectiveQty: number;
    afterEffectiveQty: number;
    beforeAffectedMatchedLots: number;
    afterAffectedMatchedLots: number;
    beforeRealizedPnl: number;
    afterRealizedPnl: number;
    beforeUnexplainedDeltaImpact: number;
    afterUnexplainedDeltaImpact: number;
  };
  executionPriceOverridePreview?: {
    executionId: string;
    rawPrice: number | null;
    beforeEffectivePrice: number | null;
    afterEffectivePrice: number | null;
    beforeAffectedMatchedLots: number;
    afterAffectedMatchedLots: number;
    beforeRealizedPnl: number;
    afterRealizedPnl: number;
    beforeUnexplainedDeltaImpact: number;
    afterUnexplainedDeltaImpact: number;
  };
}

export interface StreakSummaryResponse {
  currentStreak: number;
  currentStreakType: "WIN" | "LOSS" | null;
  longestWinStreak: number;
  longestLossStreak: number;
}

export type ImportsListApiResponse = ApiListResponse<ImportRecord> | ApiErrorResponse;
export type UploadImportApiResponse = ApiDetailResponse<UploadImportResponse> | ApiErrorResponse;
export type CommitImportApiResponse = ApiDetailResponse<CommitImportResponse> | ApiErrorResponse;
export type DeleteImportApiResponse = ApiDetailResponse<DeleteImportResponse> | ApiErrorResponse;
export type ExecutionsListApiResponse = ApiListResponse<ExecutionRecord> | ApiErrorResponse;
export type CashEventsListApiResponse = ApiListResponse<CashEventResponse> | ApiErrorResponse;
export type MatchedLotsListApiResponse = ApiListResponse<MatchedLotRecord> | ApiErrorResponse;
export type SetupsListApiResponse = ApiListResponse<SetupSummaryRecord> | ApiErrorResponse;
export type SetupDetailApiResponse = ApiDetailResponse<SetupDetailResponse> | ApiErrorResponse;
export type OverviewSummaryApiResponse = ApiDetailResponse<OverviewSummaryResponse> | ApiErrorResponse;
export type ReconciliationApiResponse = ApiDetailResponse<ReconciliationResponse> | ApiErrorResponse;
export type TtsEvidenceApiResponse = ApiDetailResponse<TtsEvidenceResponse> | ApiErrorResponse;
export type DiagnosticsApiResponse = ApiDetailResponse<DiagnosticsResponse> | ApiErrorResponse;
export type DiagnosticCaseFileApiResponse = ApiDetailResponse<DiagnosticCaseFileResponse> | ApiErrorResponse;
export type HealthApiResponse = HealthResponse;
export type AdapterListApiResponse = ApiListResponse<AdapterSummaryRecord> | ApiErrorResponse;
export type AdjustmentsListApiResponse = ApiListResponse<ManualAdjustmentRecord> | ApiErrorResponse;
export type AdjustmentCreateApiResponse = ApiDetailResponse<ManualAdjustmentRecord> | ApiErrorResponse;
export type AdjustmentReverseApiResponse = ApiDetailResponse<ReverseManualAdjustmentResponse> | ApiErrorResponse;
export type AdjustmentPreviewApiResponse = ApiDetailResponse<AdjustmentPreviewResponse> | ApiErrorResponse;
export type AccountLedgerRebuildApiResponse = ApiDetailResponse<AccountLedgerRebuildResponse> | ApiErrorResponse;
export type OptionQuotesApiResponse = ApiDetailResponse<OptionQuotesMap> | ApiErrorResponse;
export type PositionSnapshotComputeApiResponse = ApiDetailResponse<PositionSnapshotComputeResponse> | ApiErrorResponse;
export type PositionSnapshotApiResponse = PositionSnapshotResponse | ApiErrorResponse;

export interface PeriodReturnResponse {
  profit: number;
  returnPercentage: number | null;
  startingNlv: number;
  endingNlv: number;
  netFlows: number;
}

export type PeriodReturnApiResponse = ApiDetailResponse<PeriodReturnResponse> | ApiErrorResponse;

// --- Portfolio snapshot export (KapMan KB §A2 ingest contract) ---
// Emitted by GET /api/export/portfolio-snapshot as a copy-pasteable handoff the
// KapMan KB Portfolio mode consumes 1:1. Entry-time Wyckoff/DGPI/IV-HV context and
// SIGNAL alert levels are intentionally NOT here — those are journal-owned (positions.md),
// written by the KB at Pass 2, not by tradelog.

export interface PortfolioSnapshotOpenLeg {
  symbol: string; // broker-raw execution symbol (may be an OCC-style option symbol)
  underlying_symbol: string; // clean underlying ticker for display (raw symbol is broker-formatted)
  instrument_key: string;
  account_id: string; // external account id (human-facing label)
  asset_class: "OPTION" | "EQUITY";
  option_type: "CALL" | "PUT" | null;
  structure: string; // single-leg label (stock|long_call|short_call|long_put|short_put|uncategorized); spreads grouped by spread_group_id
  direction: "LONG" | "SHORT";
  spread_group_id: string | null;
  strike: string | null;
  expiration: string | null; // ISO date
  net_qty: number; // signed
  cost_basis: number; // multiplier-inclusive
  entry_date: string | null; // ISO; earliest opening execution among the leg's opens
  entry_price: number | null; // weighted avg = cost_basis / (net_qty * multiplier)
  mark: number | null;
  unrealized_pnl: number | null; // mark*net_qty*mult - cost_basis; null when mark unavailable
  // Open-leg excursions are not available in tradelog (LotExcursion is 1:1 with a closed MatchedLot).
  mae_pct: number | null; // fraction of entry (≤ 0); daily-mark excursion since entry; null when no coverage
  mfe_pct: number | null; // fraction of entry (≥ 0)
  excursion_as_of: string | null; // last priced mark date in the window
}

export interface PortfolioSnapshotScope {
  mode: "EXPLICIT"; // this export is always explicitly scoped; all-accounts is refused (#334)
  legal_entity: { slug: string; legal_name: string };
  environment: "LIVE" | "PAPER"; // mixed paper/live scopes are refused
  account_ids: string[]; // fully enumerated external account ids in scope
}

export interface PortfolioSnapshot {
  kind: "portfolio_snapshot";
  source: "kapman-tradelog";
  exported_at: string; // ISO; lineage clock for the §A2 handoff
  tradelog_schema_version: string;
  account_ids: string[]; // legacy mirror of scope.account_ids; always enumerated since 1.1
  scope: PortfolioSnapshotScope;
  as_of: string; // ISO; instant open positions were computed/priced
  open_excursions_available: boolean; // true when open-leg MAE/MFE is computed from HistoricalMark
  open_positions: PortfolioSnapshotOpenLeg[];
}

export type SchedulerRunStatus = "RUNNING" | "SUCCEEDED" | "NOOP" | "FAILED" | "SKIPPED_LOCKED" | "ABANDONED";
export type SchedulerStageStatus = "PENDING" | "SKIPPED" | "SUCCEEDED" | "FAILED";
export type SchedulerStageKey = "equity" | "option" | "values" | "excursion";
export type SchedulerSourceKey = "equityMarks" | "optionMarks" | "accountValues";
export type SchedulerFreshnessState = "CURRENT" | "STALE" | "MISSING";

/// Overall operational health, independent of any account selection.
export type SchedulerHealth = "HEALTHY" | "RUNNING" | "STALE" | "FAILED" | "NEVER_RUN";

export interface SchedulerStageSummary {
  key: SchedulerStageKey;
  label: string;
  status: SchedulerStageStatus;
  rowCount: number | null;
}

export interface SchedulerRunRecord {
  id: string;
  trigger: "SCHEDULED" | "MANUAL";
  status: SchedulerRunStatus;
  startedAt: string;
  finishedAt: string | null;
  durationMs: number | null;
  requestedStartDate: string | null;
  requestedEndDate: string | null;
  effectiveStartDate: string | null;
  effectiveEndDate: string | null;
  eligibleEndDate: string | null;
  commonMarkDate: string | null;
  stages: SchedulerStageSummary[];
  latestEquityMarkDate: string | null;
  latestOptionMarkDate: string | null;
  latestValueSnapshotDate: string | null;
  unpricedPositionCount: number | null;
  unpricedExcursionDays: number | null;
  /// Sanitized message only; never raw provider payloads or credentials.
  errorMessage: string | null;
}

export interface SchedulerFreshnessRecord {
  key: SchedulerSourceKey;
  label: string;
  latestDate: string | null;
  lagDays: number | null;
  state: SchedulerFreshnessState;
}

export interface SchedulerStatusResponse {
  jobName: string;
  checkedAt: string;
  health: SchedulerHealth;
  lastRun: SchedulerRunRecord | null;
  /// Most recent run that completed without failing. Includes NOOP, which is the
  /// normal weekend and holiday result rather than an absence of success.
  lastHealthyRun: SchedulerRunRecord | null;
  freshness: SchedulerFreshnessRecord[];
  freshnessToleranceDays: number;
  retentionDays: number;
  /// Optional webhook alerts (PIPELINE_ALERT_WEBHOOK_URL).
  alertsConfigured: boolean;
  /// Dead-man's-switch heartbeat (PIPELINE_HEARTBEAT_URL). The only monitor that
  /// still reports when the pipeline stops running entirely.
  heartbeatConfigured: boolean;
  /// Present while a run holds the lease; owner id is deliberately omitted.
  activeLeaseExpiresAt: string | null;
}

export interface SchedulerRunsListQuery {
  page?: number;
  pageSize?: number;
}

export type RecommendationPassValue = "PASS1" | "PASS2";
export type RecommendationDispositionValue = "ELIGIBLE" | "NO_TRADE" | "WAIT" | "VALIDATED" | "FLAGGED" | "REJECTED";

/// Serialized TradeRecommendation row from GET /api/recommendations. Decimal
/// columns arrive as strings; date columns as ISO strings.
export interface RecommendationRecord {
  id: string;
  recId: string;
  lineageId: string;
  localRecId: string;
  pass: RecommendationPassValue;
  disposition: RecommendationDispositionValue;
  asOf: string;
  decidedAtRaw: string | null;
  decidedAt: string | null;
  ticker: string;
  structure: string | null;
  structureRaw: string | null;
  direction: string | null;
  reason: string | null;
  optionType: string | null;
  strike: string | null;
  strikeShort: string | null;
  expirationDate: string | null;
  entryRangeLow: string | null;
  entryRangeHigh: string | null;
  entryRangeRaw: string | null;
  sizingBand: string | null;
  chainQuality: string | null;
  optionMid: string | null;
  underlyingRef: string | null;
  journalSchemaVersion: string | null;
  sourceFile: string | null;
  createdAt: string;
  updatedAt: string;
}

/// Per-run aggregate from GET /api/recommendations/lineages, newest first.
export interface RecommendationLineageSummaryRecord {
  lineageId: string;
  asOf: string | null;
  rowCount: number;
  passes: Record<string, number>;
  dispositions: Record<string, number>;
}

// ---------------------------------------------------------------------------
// Per-user profiles (#344): identity-keyed auto-saved views.
// ---------------------------------------------------------------------------

/// Range presets shared by the range filter UI and the profile document.
export type RangePreset = "kapman-start" | "all" | "ytd" | "1yr" | "3yr" | "30d" | "7d" | "custom";

export type ProfileWidgetColSpan = 1 | 2 | 3;

export interface ProfileWidgetItem {
  widgetId: string;
  colSpan: ProfileWidgetColSpan;
}

export interface ProfileRange {
  preset: RangePreset;
  /// Canonical form: non-custom presets store null dates (windows are derived
  /// at query time); custom stores both as YYYY-MM-DD with startDate <= endDate.
  startDate: string | null;
  endDate: string | null;
}

export interface ProfileSettingsV1 {
  version: 1;
  accounts: {
    /// EXTERNAL account ids (e.g. "18528700SCHW"), NOT internal cuids —
    /// profiles must survive DB rebuilds/reseeds where cuids change.
    selected: string[];
  };
  range: ProfileRange;
  dashboard: {
    /// null = the app's built-in layout; [] = intentionally no widgets.
    widgets: ProfileWidgetItem[] | null;
    /// null = the app's built-in layout; [] = intentionally no KPIs.
    kpis: string[] | null;
  };
  tables: {
    /// tableName -> hidden column ids. Filters/sorts stay session-ephemeral.
    hiddenColumns: Record<string, string[]>;
  };
}

/// Strict partial patch, merged per logical leaf: accounts | range |
/// dashboard.widgets | dashboard.kpis | tables.hiddenColumns[tableName].
export interface ProfilePatchV1 {
  accounts?: { selected: string[] };
  range?: ProfileRange;
  dashboard?: {
    widgets?: ProfileWidgetItem[] | null;
    kpis?: string[] | null;
  };
  tables?: {
    /// null (or []) deletes that table's entry.
    hiddenColumns: Record<string, string[] | null>;
  };
}

export interface ProfileGetResponse {
  email: string;
  settings: ProfileSettingsV1;
  /// true iff no USABLE stored document backs `settings` (missing, malformed,
  /// or unsupported-version row) — not "equals defaults".
  isDefault: boolean;
  /// false iff the stored version is newer than this app supports; the client
  /// then renders read-only defaults and stops autosaving.
  writable: boolean;
  /// BigInt revision serialized as a string; "0" when no row exists.
  revision: string;
  updatedAt: string | null;
}

export interface ProfilePutResponse {
  settings: ProfileSettingsV1;
  revision: string;
  updatedAt: string;
}

export type ProfileGetApiResponse = ApiDetailResponse<ProfileGetResponse> | ApiErrorResponse;
export type ProfilePutApiResponse = ApiDetailResponse<ProfilePutResponse> | ApiErrorResponse;
