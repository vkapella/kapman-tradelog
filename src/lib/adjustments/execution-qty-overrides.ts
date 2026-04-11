import { sortAdjustments } from "@/lib/adjustments/apply-adjustments";
import { parsePayloadByType } from "@/lib/adjustments/types";
import type { LedgerExecution } from "@/lib/ledger/fifo-matcher";
import type { ManualAdjustmentRecord } from "@/types/api";

export interface ExecutionQtyOverrideEntry {
  adjustmentId: string;
  executionId: string;
  overrideQty: number;
}

export function buildExecutionQtyOverrideMap(adjustments: ManualAdjustmentRecord[]): Map<string, ExecutionQtyOverrideEntry> {
  const active = sortAdjustments(
    adjustments.filter((adjustment) => adjustment.status === "ACTIVE" && adjustment.adjustmentType === "EXECUTION_QTY_OVERRIDE"),
  );
  const byExecutionId = new Map<string, ExecutionQtyOverrideEntry>();

  for (const adjustment of active) {
    try {
      const payload = parsePayloadByType("EXECUTION_QTY_OVERRIDE", adjustment.payload);
      byExecutionId.set(payload.executionId, {
        adjustmentId: adjustment.id,
        executionId: payload.executionId,
        overrideQty: payload.overrideQty,
      });
    } catch {
      continue;
    }
  }

  return byExecutionId;
}

export function applyExecutionQtyOverrideToLedgerExecutions(
  executions: LedgerExecution[],
  adjustments: ManualAdjustmentRecord[],
): { executions: LedgerExecution[]; overrideMap: Map<string, ExecutionQtyOverrideEntry>; unmatchedExecutionIds: string[] } {
  const overrideMap = buildExecutionQtyOverrideMap(adjustments);
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
      quantity: override.overrideQty,
    };
  });

  const unmatchedExecutionIds = Array.from(overrideMap.keys()).filter((executionId) => !matchedExecutionIds.has(executionId));
  return {
    executions: adjustedExecutions,
    overrideMap,
    unmatchedExecutionIds,
  };
}

export function findSupersededExecutionQtyOverrideIds(adjustments: ManualAdjustmentRecord[]): Set<string> {
  const active = sortAdjustments(
    adjustments.filter((adjustment) => adjustment.status === "ACTIVE" && adjustment.adjustmentType === "EXECUTION_QTY_OVERRIDE"),
  );
  const latestByExecutionId = new Map<string, string>();

  for (const adjustment of active) {
    try {
      const payload = parsePayloadByType("EXECUTION_QTY_OVERRIDE", adjustment.payload);
      latestByExecutionId.set(payload.executionId, adjustment.id);
    } catch {
      continue;
    }
  }

  const superseded = new Set<string>();
  for (const adjustment of active) {
    try {
      const payload = parsePayloadByType("EXECUTION_QTY_OVERRIDE", adjustment.payload);
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
