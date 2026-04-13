import { describe, expect, it } from "vitest";
import { getOverallTtsReadinessStatus, getTtsMetricStatus } from "./readiness";
import type { TtsEvidenceResponse } from "@/types/api";

const baseEvidence: TtsEvidenceResponse = {
  tradesPerMonth: 60,
  activeDaysPerWeek: 4,
  averageHoldingPeriodDays: 31,
  medianHoldingPeriodDays: 12,
  annualizedTradeCount: 720,
  grossProceedsProxy: "10000.00",
  holdingPeriodDistribution: [],
};

describe("TTS readiness thresholds", () => {
  it("marks threshold metrics with the documented green and amber bands", () => {
    expect(getTtsMetricStatus("tradesPerMonth", { ...baseEvidence, tradesPerMonth: 60 })).toBe("green");
    expect(getTtsMetricStatus("tradesPerMonth", { ...baseEvidence, tradesPerMonth: 40 })).toBe("amber");
    expect(getTtsMetricStatus("activeDaysPerWeek", { ...baseEvidence, activeDaysPerWeek: 2 })).toBe("red");
    expect(getTtsMetricStatus("averageHoldingPeriodDays", { ...baseEvidence, averageHoldingPeriodDays: 40 })).toBe("amber");
    expect(getTtsMetricStatus("annualizedTradeCount", { ...baseEvidence, annualizedTradeCount: 300 })).toBe("red");
  });

  it("uses the worst threshold metric for the overall readiness status", () => {
    expect(getOverallTtsReadinessStatus(baseEvidence)).toBe("green");
    expect(getOverallTtsReadinessStatus({ ...baseEvidence, annualizedTradeCount: 500 })).toBe("amber");
    expect(getOverallTtsReadinessStatus({ ...baseEvidence, activeDaysPerWeek: 2.5 })).toBe("red");
  });
});
