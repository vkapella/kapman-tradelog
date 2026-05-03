import type { TtsEvidenceResponse } from "@/types/api";

export type TtsRagStatus = "green" | "amber" | "red" | "info";

export interface TtsThresholdMetricDefinition {
  id: "tradesPerMonth" | "activeDaysPerWeek" | "averageHoldingPeriodDays" | "annualizedTradeCount";
  label: string;
  targetLabel: string;
  evaluate: (value: number) => TtsRagStatus;
}

export const TTS_THRESHOLD_METRICS: TtsThresholdMetricDefinition[] = [
  {
    id: "tradesPerMonth",
    label: "Trades/mo",
    targetLabel: "Target >= 60 / month",
    evaluate: (value) => {
      if (value >= 60) {
        return "green";
      }
      if (value >= 40) {
        return "amber";
      }
      return "red";
    },
  },
  {
    id: "activeDaysPerWeek",
    label: "Active days/wk",
    targetLabel: "Target >= 4 / week",
    evaluate: (value) => {
      if (value >= 4) {
        return "green";
      }
      if (value >= 3) {
        return "amber";
      }
      return "red";
    },
  },
  {
    id: "averageHoldingPeriodDays",
    label: "Avg hold",
    targetLabel: "Target <= 31d",
    evaluate: (value) => {
      if (value <= 31) {
        return "green";
      }
      if (value <= 45) {
        return "amber";
      }
      return "red";
    },
  },
  {
    id: "annualizedTradeCount",
    label: "Annual trades",
    targetLabel: "Target >= 720 / year",
    evaluate: (value) => {
      if (value >= 720) {
        return "green";
      }
      if (value >= 480) {
        return "amber";
      }
      return "red";
    },
  },
];

export function getTtsMetricStatus(
  metricId: TtsThresholdMetricDefinition["id"],
  evidence: TtsEvidenceResponse,
): TtsRagStatus {
  const definition = TTS_THRESHOLD_METRICS.find((metric) => metric.id === metricId);
  if (!definition) {
    return "info";
  }

  return definition.evaluate(evidence[metricId]);
}

export function getOverallTtsReadinessStatus(evidence: TtsEvidenceResponse): TtsRagStatus {
  const statuses = TTS_THRESHOLD_METRICS.map((metric) => metric.evaluate(evidence[metric.id]));

  if (statuses.includes("red")) {
    return "red";
  }

  if (statuses.includes("amber")) {
    return "amber";
  }

  return "green";
}

export function getTtsStatusLabel(status: TtsRagStatus): string {
  if (status === "green") {
    return "Ready";
  }

  if (status === "amber") {
    return "Watch";
  }

  if (status === "red") {
    return "At Risk";
  }

  return "Info";
}

export function getTtsStatusColor(status: TtsRagStatus): string {
  if (status === "green") {
    return "var(--pos)";
  }

  if (status === "amber") {
    return "var(--warn)";
  }

  if (status === "red") {
    return "var(--neg)";
  }

  return "var(--accent)";
}

export function getTtsStatusTintClass(status: TtsRagStatus): string {
  if (status === "green") {
    return "bg-[color:color-mix(in_srgb,var(--pos)_18%,transparent)] text-[color:var(--pos)]";
  }

  if (status === "amber") {
    return "bg-[color:color-mix(in_srgb,var(--warn)_18%,transparent)] text-[color:var(--warn)]";
  }

  if (status === "red") {
    return "bg-[color:color-mix(in_srgb,var(--neg)_18%,transparent)] text-[color:var(--neg)]";
  }

  return "bg-surface-2 text-[color:var(--accent)]";
}
