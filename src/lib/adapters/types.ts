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
}

export interface ParseResult {
  warnings: AdapterWarning[];
  accountMetadata: ParsedAccountMetadata;
  executions: NormalizedExecution[];
  snapshots: NormalizedDailyAccountSnapshot[];
  parsedRows: number;
  skippedRows: number;
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
