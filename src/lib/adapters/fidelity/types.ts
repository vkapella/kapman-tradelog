export interface RawFidelityRow {
  runDate: Date | null;
  rawAction: string;
  symbol: string;
  description: string;
  marginType: "Cash" | "Margin" | null;
  price: number | null;
  quantity: number | null;
  commission: number | null;
  fees: number | null;
  accruedInterest: number | null;
  amount: number | null;
  cashBalance: number | null;
  settlementDate: Date | null;
}

export interface OptionDetails {
  underlyingTicker: string;
  expirationDate: string;
  optionType: "CALL" | "PUT";
  strikePrice: number;
}

export type CashEventType =
  | "DIVIDEND"
  | "REINVESTMENT"
  | "REDEMPTION"
  | "MONEY_MARKET_BUY"
  | "MONEY_MARKET"
  | "TRANSFER_IN"
  | "ACAT_RECEIVE"
  | "ACAT_CREDIT";

export type ActionClassification =
  | { kind: "EXECUTION"; side: "BUY" | "SELL"; openClose: "OPEN" | "CLOSE" | null; assetClass: "OPTION" | "EQUITY" }
  | { kind: "CASH_EVENT"; cashEventType: CashEventType }
  | { kind: "CANCELLED" }
  | { kind: "UNKNOWN" };

export interface ImportWarning {
  rowIndex: number;
  rawAction: string;
  message: string;
}

export type ImportRecordStatus = "VALID" | "WARNING" | "SKIPPED" | "CANCELLED";

interface BaseImportRecord {
  rowIndex: number;
  status: ImportRecordStatus;
  accountId: string | null;
  symbol: string;
  description: string;
  marginType: "Cash" | "Margin" | null;
  rawAction: string;
  actionClassification: string;
}

export interface ExecutionImportRecord extends BaseImportRecord {
  kind: "EXECUTION";
  executionDate: Date | null;
  settlementDate: Date | null;
  underlyingTicker: string;
  assetClass: "OPTION" | "EQUITY";
  optionType: "CALL" | "PUT" | null;
  expirationDate: string | null;
  strikePrice: number | null;
  side: "BUY" | "SELL";
  openClose: "OPEN" | "CLOSE" | null;
  quantity: number;
  price: number | null;
  commission: number;
  fees: number;
  amount: number | null;
  assignmentLinkId: string | null;
}

export interface CashEventImportRecord extends BaseImportRecord {
  kind: "CASH_EVENT";
  eventDate: Date | null;
  cashEventType: CashEventType;
  amount: number | null;
}

export type ImportRecord = ExecutionImportRecord | CashEventImportRecord;

export interface FidelityPreviewRow {
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
  status: ImportRecordStatus;
  warningMessage?: string;
}

export interface TransformResult {
  records: ImportRecord[];
  previewRows: FidelityPreviewRow[];
  warnings: ImportWarning[];
  cancelledCount: number;
  skippedBlankCount: number;
}
