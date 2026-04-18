import { sortAdjustments } from "@/lib/adjustments/apply-adjustments";
import { parsePayloadByType } from "@/lib/adjustments/types";
import type { LedgerExecution } from "@/lib/ledger/fifo-matcher";
import type { ManualAdjustmentRecord } from "@/types/api";

export interface ExecutionPriceOverrideEntry {
  adjustmentId: string;
  executionId: string;
  overridePrice: number;
}

export function buildExecutionPriceOverrideMap(adjustments: ManualAdjustmentRecord[]): Map<string, ExecutionPriceOverrideEntry> {
  const active = sortAdjustments(
    adjustments.filter((adjustment) => adjustment.status === "ACTIVE" && adjustment.adjustmentType === "EXECUTION_PRICE_OVERRIDE"),
  );
  const byExecutionId = new Map<string, ExecutionPriceOverrideEntry>();

  for (const adjustment of active) {
    try {
      const payload = parsePayloadByType("EXECUTION_PRICE_OVERRIDE", adjustment.payload);
      byExecutionId.set(payload.executionId, {
        adjustmentId: adjustment.id,
        executionId: payload.executionId,
        overridePrice: payload.overridePrice,
      });
    } catch {
      continue;
    }
  }

  return byExecutionId;
}

export function applyExecutionPriceOverrideToLedgerExecutions(
  executions: LedgerExecution[],
  adjustments: ManualAdjustmentRecord[],
): { executions: LedgerExecution[]; overrideMap: Map<string, ExecutionPriceOverrideEntry>; unmatchedExecutionIds: string[] } {
  const overrideMap = buildExecutionPriceOverrideMap(adjustments);
  if (overrideMap.size === 0) {
    return { executions, overrideMap, unmatchedExecutionIds: [] };
  }

  const matchedExecutionIds = new Set<string>();
  const adjustedExecutions = executions.map((execution) => {
    const override = overrideMap.get(execution.id);
    if (!override) {
      return execution;
    }

    matchedExecutionIds.add(execution.id);
    return {
      ...execution,
      price: override.overridePrice,
    };
  });

  const unmatchedExecutionIds = Array.from(overrideMap.keys()).filter((executionId) => !matchedExecutionIds.has(executionId));
  return {
    executions: adjustedExecutions,
    overrideMap,
    unmatchedExecutionIds,
  };
}

export function findSupersededExecutionPriceOverrideIds(adjustments: ManualAdjustmentRecord[]): Set<string> {
  const active = sortAdjustments(
    adjustments.filter((adjustment) => adjustment.status === "ACTIVE" && adjustment.adjustmentType === "EXECUTION_PRICE_OVERRIDE"),
  );
  const latestByExecutionId = new Map<string, string>();

  for (const adjustment of active) {
    try {
      const payload = parsePayloadByType("EXECUTION_PRICE_OVERRIDE", adjustment.payload);
      latestByExecutionId.set(payload.executionId, adjustment.id);
    } catch {
      continue;
    }
  }

  const superseded = new Set<string>();
  for (const adjustment of active) {
    try {
      const payload = parsePayloadByType("EXECUTION_PRICE_OVERRIDE", adjustment.payload);
      const latestId = latestByExecutionId.get(payload.executionId);
      if (latestId && latestId !== adjustment.id) {
        superseded.add(adjustment.id);
      }
    } catch {
      continue;
    }
  }

  return superseded;
}
