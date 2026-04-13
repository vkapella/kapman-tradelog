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

export interface AccountRecord {
  id: string;
  accountId: string;
  displayLabel: string | null;
  brokerName: string | null;
  startingCapital: string | null;
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
  profitFactor: string | null;
  expectancy: string | null;
  maxDrawdown: string | null;
  startingCapital: string;
  currentNlv: string;
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
    cashSource: "snapshot" | "heuristic_fallback";
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

export interface OptionQuoteRecord {
  mark: number;
  bid: number;
  ask: number;
  delta: number;
  theta: number;
  iv: number;
  dte: number;
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
}

export interface PositionSnapshotComputeResponse {
  snapshotId: string;
  status: PositionSnapshotStatus;
}

export interface PositionSnapshotResponseData {
  id: string;
  snapshotAt: string;
  status: PositionSnapshotStatus;
  errorMessage?: string;
  positions: PositionSnapshotOpenPosition[];
  unrealizedPnl: string;
  realizedPnl: string;
  cashAdjustments: string;
  manualAdjustments: string;
  currentNlv: string;
  startingCapital: string;
  totalGain: string;
  unexplainedDelta: string;
}

export interface PositionSnapshotResponse {
  data: PositionSnapshotResponseData | null;
  meta: {
    snapshotExists: boolean;
    snapshotAge?: number;
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
  | "EXECUTION_QTY_OVERRIDE";
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
export type OptionQuotesApiResponse = ApiDetailResponse<OptionQuotesMap> | ApiErrorResponse;
export type PositionSnapshotComputeApiResponse = ApiDetailResponse<PositionSnapshotComputeResponse> | ApiErrorResponse;
export type PositionSnapshotApiResponse = PositionSnapshotResponse | ApiErrorResponse;
