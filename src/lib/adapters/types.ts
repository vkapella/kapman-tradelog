export interface AdapterWarning {
  code: string;
  message: string;
  rowRef?: string;
}

export interface AdapterCoverage {
  equities: boolean;
  options: boolean;
  multiLeg: boolean;
  snapshots: boolean;
  feesFromCashBalance: boolean;
  notes: string;
}

export interface UploadedFile {
  name: string;
  content: string;
  mimeType: string;
  size: number;
}

export interface DetectionResult {
  matched: boolean;
  confidence: number;
  brokerId: "schwab_thinkorswim" | "fidelity";
  formatVersion: string;
  reason: string;
  warnings: AdapterWarning[];
}

export interface ParsedAccountMetadata {
  accountId: string;
  label: string;
  paperMoney: boolean;
}

export interface NormalizedDailyAccountSnapshot {
  snapshotDate: Date;
  balance: number;
  totalCash?: number | null;
  brokerNetLiquidationValue?: number | null;
}

export type CashEventRowType =
  | "FND"
  | "LIQ"
  | "RAD"
  | "DIVIDEND"
  | "REINVESTMENT"
  | "REDEMPTION"
  | "MONEY_MARKET_BUY"
  | "MONEY_MARKET"
  | "TRANSFER_IN"
  | "ACAT_RECEIVE"
  | "ACAT_CREDIT";

export interface NormalizedCashEvent {
  eventDate: Date;
  rowType: CashEventRowType | string;
  refNumber: string;
  description: string;
  amount: number;
  symbol?: string | null;
  marginType?: "Cash" | "Margin" | null;
}

export interface LegacyExecutionPreviewRow {
  eventTimestamp: string;
  symbol: string;
  side: string;
  quantity: number;
  price: number | null;
  spread: string;
  openingClosingEffect: string;
}

export interface FidelityPreviewRow {
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

export type AdapterPreviewRow = LegacyExecutionPreviewRow | FidelityPreviewRow;

export interface ParseResult {
  warnings: AdapterWarning[];
  accountMetadata: ParsedAccountMetadata;
  executions: NormalizedExecution[];
  snapshots: NormalizedDailyAccountSnapshot[];
  cashEvents: NormalizedCashEvent[];
  parsedRows: number;
  skippedRows: number;
  previewRows?: AdapterPreviewRow[];
}

export interface NormalizedExecution {
  eventTimestamp: Date;
  tradeDate: Date;
  eventType: "TRADE";
  assetClass: "EQUITY" | "OPTION";
  symbol: string;
  side: "BUY" | "SELL";
  quantity: number;
  price: number | null;
  grossAmount: number | null;
  netAmount: number | null;
  openingClosingEffect: "TO_OPEN" | "TO_CLOSE" | "UNKNOWN";
  underlyingSymbol: string | null;
  optionType: string | null;
  strike: number | null;
  expirationDate: Date | null;
  spread: string;
  spreadGroupId: string | null;
  brokerRefNumber: string | null;
  sourceRowRef: string;
  rawRowJson: Record<string, string | null>;
}

export interface BrokerAdapter {
  id: "schwab_thinkorswim" | "fidelity";
  displayName: string;
  status: "active" | "stub";
  detect(file: UploadedFile): DetectionResult;
  parse(file: UploadedFile): ParseResult;
  coverage(): AdapterCoverage;
}
