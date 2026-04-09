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

export interface ImportRecord {
  id: string;
  filename: string;
  broker: BrokerId;
  accountId: string;
  status: ImportStatus;
  parsedRows: number;
  persistedRows: number;
  skippedRows: number;
  createdAt: string;
}

export interface UploadImportResponse {
  importId: string;
  detection: {
    broker: BrokerId;
    confidence: number;
    formatVersion: string;
    rowEstimate: number;
  };
}

export interface CommitImportResponse {
  importId: string;
  parsedRows: number;
  persistedRows: number;
  skippedRows: number;
  warnings: string[];
}

export interface ImportsListQuery {
  account?: string;
  page?: number;
  pageSize?: number;
}

export interface ExecutionRecord {
  id: string;
  accountId: string;
  symbol: string;
  eventTimestamp: string;
  eventType: string;
  assetClass: string;
  side: string | null;
  quantity: string;
  price: string | null;
  importId: string;
}

export interface ExecutionsListQuery {
  symbol?: string;
  account?: string;
  date_from?: string;
  date_to?: string;
  page?: number;
  pageSize?: number;
}

export interface MatchedLotRecord {
  id: string;
  accountId: string;
  quantity: string;
  realizedPnl: string;
  holdingDays: number;
  outcome: string;
  openExecutionId: string;
  closeExecutionId: string | null;
}

export interface MatchedLotsListQuery {
  symbol?: string;
  outcome?: string;
  account?: string;
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
  tag?: string;
  account?: string;
  page?: number;
  pageSize?: number;
}

export interface SetupDetailResponse {
  setup: SetupSummaryRecord;
  lots: MatchedLotRecord[];
  executionIds: string[];
}

export interface OverviewSummaryResponse {
  netPnl: string;
  executionCount: number;
  matchedLotCount: number;
  setupCount: number;
  averageHoldDays: string;
  snapshotCount: number;
}

export interface TtsEvidenceResponse {
  tradesPerMonth: number;
  activeDaysPerWeek: number;
  averageHoldingPeriodDays: number;
  medianHoldingPeriodDays: number;
  annualizedTradeCount: number;
  grossProceedsProxy: string;
}

export interface DiagnosticsResponse {
  parseCoverage: number;
  unsupportedRowCount: number;
  matchingCoverage: number;
  uncategorizedCount: number;
  warningsCount: number;
}

export interface HealthResponse {
  status: "ok" | "degraded";
  db: "connected" | "disconnected";
}

export type ImportsListApiResponse = ApiListResponse<ImportRecord> | ApiErrorResponse;
export type UploadImportApiResponse = ApiDetailResponse<UploadImportResponse> | ApiErrorResponse;
export type CommitImportApiResponse = ApiDetailResponse<CommitImportResponse> | ApiErrorResponse;
export type ExecutionsListApiResponse = ApiListResponse<ExecutionRecord> | ApiErrorResponse;
export type MatchedLotsListApiResponse = ApiListResponse<MatchedLotRecord> | ApiErrorResponse;
export type SetupsListApiResponse = ApiListResponse<SetupSummaryRecord> | ApiErrorResponse;
export type SetupDetailApiResponse = ApiDetailResponse<SetupDetailResponse> | ApiErrorResponse;
export type OverviewSummaryApiResponse = ApiDetailResponse<OverviewSummaryResponse> | ApiErrorResponse;
export type TtsEvidenceApiResponse = ApiDetailResponse<TtsEvidenceResponse> | ApiErrorResponse;
export type DiagnosticsApiResponse = ApiDetailResponse<DiagnosticsResponse> | ApiErrorResponse;
export type HealthApiResponse = ApiDetailResponse<HealthResponse>;
