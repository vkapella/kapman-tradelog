import { fidelityAdapter } from "./fidelity";
import { schwabThinkorswimAdapter } from "./schwab-thinkorswim";
import type { BrokerAdapter, DetectionResult, UploadedFile } from "./types";

const adapters: BrokerAdapter[] = [schwabThinkorswimAdapter, fidelityAdapter];

export function listAdapters() {
  return adapters;
}

export function detectAdapter(file: UploadedFile): { adapter: BrokerAdapter; detection: DetectionResult } | null {
  const detections = adapters
    .map((adapter) => ({ adapter, detection: adapter.detect(file) }))
    .filter((entry) => entry.detection.matched)
    .sort((a, b) => b.detection.confidence - a.detection.confidence);

  return detections[0] ?? null;
}
