import { z } from "zod";
import type {
  AddPositionPayload,
  AdjustmentType,
  ExecutionPriceOverridePayload,
  ExecutionQtyOverridePayload,
  ManualAdjustmentPayload,
  PriceOverridePayload,
  QtyOverridePayload,
  RemovePositionPayload,
  SplitPayload,
} from "@/types/api";

const splitPayloadSchema = z.object({
  from: z.number().positive(),
  to: z.number().positive(),
});

const qtyOverridePayloadSchema = z.object({
  instrumentKey: z.string().min(1),
  overrideQty: z.number(),
});

const priceOverridePayloadSchema = z.object({
  instrumentKey: z.string().min(1),
  overridePrice: z.number().nonnegative(),
});

const executionQtyOverridePayloadSchema = z.object({
  executionId: z.string().min(1),
  overrideQty: z.number().nonnegative(),
});

const executionPriceOverridePayloadSchema = z.object({
  executionId: z.string().min(1),
  overridePrice: z.number().nonnegative(),
});

const addPositionPayloadSchema = z.object({
  instrumentKey: z.string().min(1),
  assetClass: z.enum(["EQUITY", "OPTION"]),
  netQty: z.number(),
  costBasis: z.number(),
  optionType: z.enum(["CALL", "PUT"]).optional(),
  strike: z.string().optional(),
  expirationDate: z.string().optional(),
});

const removePositionPayloadSchema = z.object({
  instrumentKey: z.string().min(1),
});

export const manualAdjustmentCreateSchema = z.object({
  createdBy: z.string().trim().optional(),
  accountId: z.string().trim().min(1),
  symbol: z.string().trim().min(1),
  effectiveDate: z.string().datetime(),
  adjustmentType: z.enum([
    "SPLIT",
    "QTY_OVERRIDE",
    "PRICE_OVERRIDE",
    "ADD_POSITION",
    "REMOVE_POSITION",
    "EXECUTION_QTY_OVERRIDE",
    "EXECUTION_PRICE_OVERRIDE",
  ]),
  payload: z.unknown(),
  reason: z.string().trim().min(1),
  evidenceRef: z.string().trim().optional(),
});

export type ManualAdjustmentCreateInput = z.infer<typeof manualAdjustmentCreateSchema>;

export function parsePayloadByType(type: "SPLIT", payload: unknown): SplitPayload;
export function parsePayloadByType(type: "QTY_OVERRIDE", payload: unknown): QtyOverridePayload;
export function parsePayloadByType(type: "PRICE_OVERRIDE", payload: unknown): PriceOverridePayload;
export function parsePayloadByType(type: "EXECUTION_QTY_OVERRIDE", payload: unknown): ExecutionQtyOverridePayload;
export function parsePayloadByType(type: "EXECUTION_PRICE_OVERRIDE", payload: unknown): ExecutionPriceOverridePayload;
export function parsePayloadByType(type: "ADD_POSITION", payload: unknown): AddPositionPayload;
export function parsePayloadByType(type: "REMOVE_POSITION", payload: unknown): RemovePositionPayload;
export function parsePayloadByType(type: AdjustmentType, payload: unknown): ManualAdjustmentPayload;
export function parsePayloadByType(type: AdjustmentType, payload: unknown): ManualAdjustmentPayload {
  switch (type) {
    case "SPLIT":
      return splitPayloadSchema.parse(payload);
    case "QTY_OVERRIDE":
      return qtyOverridePayloadSchema.parse(payload);
    case "PRICE_OVERRIDE":
      return priceOverridePayloadSchema.parse(payload);
    case "EXECUTION_QTY_OVERRIDE":
      return executionQtyOverridePayloadSchema.parse(payload);
    case "EXECUTION_PRICE_OVERRIDE":
      return executionPriceOverridePayloadSchema.parse(payload);
    case "ADD_POSITION":
      return addPositionPayloadSchema.parse(payload);
    case "REMOVE_POSITION":
      return removePositionPayloadSchema.parse(payload);
    default:
      throw new Error(`Unsupported adjustment type: ${String(type)}`);
  }
}
