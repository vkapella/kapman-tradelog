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

export interface ParseResult {
  warnings: AdapterWarning[];
  accountMetadata: ParsedAccountMetadata;
}

export interface BrokerAdapter {
  id: "schwab_thinkorswim" | "fidelity";
  displayName: string;
  status: "active" | "stub";
  detect(file: UploadedFile): DetectionResult;
  parse(file: UploadedFile): ParseResult;
  coverage(): AdapterCoverage;
}
