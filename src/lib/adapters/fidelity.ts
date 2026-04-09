import type { BrokerAdapter, DetectionResult, ParseResult, UploadedFile } from "./types";

function detectFidelity(_file: UploadedFile): DetectionResult {
  return {
    matched: false,
    confidence: 0,
    brokerId: "fidelity",
    formatVersion: "stub",
    reason: "Fidelity detector is a registered stub for the next adapter iteration.",
    warnings: [
      {
        code: "FIDELITY_STUB",
        message: "Fidelity adapter is registered but parser implementation is not yet available.",
      },
    ],
  };
}

function parseFidelity(_file: UploadedFile): ParseResult {
  throw new Error("Fidelity parser is a stub and is not implemented in MVP Step 3.");
}

// Deduplication is broker-neutral in the ledger ingest layer (/src/lib/ledger/ingest.ts),
// so Fidelity will inherit duplicate protection automatically once parsing is implemented.
export const fidelityAdapter: BrokerAdapter = {
  id: "fidelity",
  displayName: "Fidelity",
  status: "stub",
  detect: detectFidelity,
  parse: parseFidelity,
  coverage() {
    return {
      equities: false,
      options: false,
      multiLeg: false,
      snapshots: false,
      feesFromCashBalance: false,
      notes: "Registered stub adapter to satisfy extension path requirements.",
    };
  },
};
