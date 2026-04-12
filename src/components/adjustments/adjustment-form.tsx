"use client";

import { useMemo, useState } from "react";
import { useAccountFilterContext } from "@/contexts/AccountFilterContext";
import type { AdjustmentPreviewResponse, AdjustmentType, CreateManualAdjustmentRequest, ExecutionRecord, ManualAdjustmentRecord } from "@/types/api";

interface ExecutionLookupPayload {
  data: ExecutionRecord[];
}

function defaultEffectiveDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function directionLabel(from: number, to: number): string {
  if (to > from) {
    return "Forward split";
  }
  if (to < from) {
    return "Reverse split";
  }
  return "No ratio change";
}

export function AdjustmentForm({
  onCreated,
  onPreview,
}: {
  onCreated: (created: ManualAdjustmentRecord) => void;
  onPreview: (preview: AdjustmentPreviewResponse | null) => void;
}) {
  const { availableAccounts, getAccountDisplayText } = useAccountFilterContext();
  const [accountId, setAccountId] = useState("");
  const [symbol, setSymbol] = useState("");
  const [effectiveDate, setEffectiveDate] = useState(defaultEffectiveDate());
  const [adjustmentType, setAdjustmentType] = useState<AdjustmentType>("SPLIT");
  const [reason, setReason] = useState("");
  const [evidenceRef, setEvidenceRef] = useState("");
  const [createdBy, setCreatedBy] = useState("local-user");

  const [splitFrom, setSplitFrom] = useState(1);
  const [splitTo, setSplitTo] = useState(1);
  const [instrumentKey, setInstrumentKey] = useState("");
  const [executionId, setExecutionId] = useState("");
  const [executionOverrideQtyInput, setExecutionOverrideQtyInput] = useState("");
  const [resolvedExecution, setResolvedExecution] = useState<ExecutionRecord | null>(null);
  const [executionLookupError, setExecutionLookupError] = useState<string | null>(null);
  const [executionLookupLoading, setExecutionLookupLoading] = useState(false);
  const [overrideQty, setOverrideQty] = useState(0);
  const [overridePrice, setOverridePrice] = useState(0);
  const [addAssetClass, setAddAssetClass] = useState<"EQUITY" | "OPTION">("EQUITY");
  const [addNetQty, setAddNetQty] = useState(0);
  const [addCostBasis, setAddCostBasis] = useState(0);
  const [addOptionType, setAddOptionType] = useState<"CALL" | "PUT">("CALL");
  const [addStrike, setAddStrike] = useState("");
  const [addExpirationDate, setAddExpirationDate] = useState("");

  const [saving, setSaving] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const payload = useMemo(() => {
    if (adjustmentType === "SPLIT") {
      return { from: splitFrom, to: splitTo };
    }
    if (adjustmentType === "QTY_OVERRIDE") {
      return { instrumentKey, overrideQty };
    }
    if (adjustmentType === "PRICE_OVERRIDE") {
      return { instrumentKey, overridePrice };
    }
    if (adjustmentType === "EXECUTION_QTY_OVERRIDE") {
      return { executionId: executionId.trim(), overrideQty: Number(executionOverrideQtyInput) };
    }
    if (adjustmentType === "ADD_POSITION") {
      return {
        instrumentKey,
        assetClass: addAssetClass,
        netQty: addNetQty,
        costBasis: addCostBasis,
        optionType: addAssetClass === "OPTION" ? addOptionType : undefined,
        strike: addAssetClass === "OPTION" ? addStrike || undefined : undefined,
        expirationDate: addAssetClass === "OPTION" ? addExpirationDate || undefined : undefined,
      };
    }
    return { instrumentKey };
  }, [
    addAssetClass,
    addCostBasis,
    addExpirationDate,
    addNetQty,
    addOptionType,
    addStrike,
    adjustmentType,
    executionId,
    executionOverrideQtyInput,
    instrumentKey,
    overridePrice,
    overrideQty,
    splitFrom,
    splitTo,
  ]);

  const effectiveDateLocked = adjustmentType === "EXECUTION_QTY_OVERRIDE";
  const executionResolved =
    adjustmentType === "EXECUTION_QTY_OVERRIDE" &&
    resolvedExecution !== null &&
    resolvedExecution.id === executionId.trim() &&
    resolvedExecution.accountId === accountId;
  const executionOverrideQty = Number(executionOverrideQtyInput);
  const hasValidExecutionOverrideQty =
    adjustmentType !== "EXECUTION_QTY_OVERRIDE" ||
    (executionOverrideQtyInput.trim().length > 0 && Number.isFinite(executionOverrideQty));

  async function resolveExecutionId(): Promise<ExecutionRecord | null> {
    if (adjustmentType !== "EXECUTION_QTY_OVERRIDE") {
      return null;
    }

    const trimmedExecutionId = executionId.trim();
    if (!trimmedExecutionId) {
      setResolvedExecution(null);
      setExecutionLookupError("Execution ID is required.");
      return null;
    }

    setExecutionLookupLoading(true);
    setExecutionLookupError(null);
    try {
      const response = await fetch(`/api/executions?execution=${encodeURIComponent(trimmedExecutionId)}&page=1&pageSize=1`, {
        cache: "no-store",
      });
      const payload = (await response.json()) as ExecutionLookupPayload;
      if (!response.ok || !Array.isArray(payload.data)) {
        setResolvedExecution(null);
        setExecutionLookupError("Execution not found.");
        return null;
      }

      const match = payload.data.find((row) => row.id === trimmedExecutionId && row.accountId === accountId) ?? null;
      if (!match) {
        setResolvedExecution(null);
        setExecutionLookupError("Execution not found.");
        return null;
      }

      setResolvedExecution(match);
      setExecutionLookupError(null);
      setSymbol(match.symbol.toUpperCase());
      setEffectiveDate(match.tradeDate.slice(0, 10));
      return match;
    } catch {
      setResolvedExecution(null);
      setExecutionLookupError("Execution not found.");
      return null;
    } finally {
      setExecutionLookupLoading(false);
    }
  }

  function handleAdjustmentTypeChange(nextType: AdjustmentType) {
    const previousType = adjustmentType;
    setAdjustmentType(nextType);
    setError(null);

    if (nextType === "EXECUTION_QTY_OVERRIDE") {
      setInstrumentKey("");
      setExecutionLookupError(null);
      setResolvedExecution(null);
      setExecutionOverrideQtyInput("");
      return;
    }

    setExecutionId("");
    setExecutionOverrideQtyInput("");
    setExecutionLookupError(null);
    setResolvedExecution(null);
    if (previousType === "EXECUTION_QTY_OVERRIDE") {
      setEffectiveDate(defaultEffectiveDate());
    }
  }

  async function handlePreview() {
    setPreviewing(true);
    setError(null);
    try {
      if (adjustmentType === "EXECUTION_QTY_OVERRIDE" && !hasValidExecutionOverrideQty) {
        onPreview(null);
        setError("Override Qty is required.");
        return;
      }

      if (adjustmentType === "EXECUTION_QTY_OVERRIDE") {
        const match = await resolveExecutionId();
        if (!match) {
          onPreview(null);
          return;
        }
      }

      const params = new URLSearchParams({
        accountId,
        symbol: symbol.toUpperCase(),
        effectiveDate: new Date(`${effectiveDate}T00:00:00.000Z`).toISOString(),
        adjustmentType,
        payload: JSON.stringify(payload),
      });
      const response = await fetch(`/api/adjustments/preview?${params.toString()}`, { cache: "no-store" });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result?.error?.message ?? "Preview failed");
      }
      onPreview(result.data as AdjustmentPreviewResponse);
    } catch (loadError) {
      onPreview(null);
      setError(loadError instanceof Error ? loadError.message : "Preview failed");
    } finally {
      setPreviewing(false);
    }
  }

  async function handleCreate() {
    setSaving(true);
    setError(null);
    try {
      if (adjustmentType === "EXECUTION_QTY_OVERRIDE" && !hasValidExecutionOverrideQty) {
        setError("Override Qty is required.");
        return;
      }

      if (adjustmentType === "EXECUTION_QTY_OVERRIDE") {
        const match = await resolveExecutionId();
        if (!match) {
          return;
        }
      }

      const body: CreateManualAdjustmentRequest = {
        createdBy,
        accountId,
        symbol: symbol.toUpperCase(),
        effectiveDate: new Date(`${effectiveDate}T00:00:00.000Z`).toISOString(),
        adjustmentType,
        payload,
        reason,
        evidenceRef: evidenceRef || undefined,
      };

      const response = await fetch("/api/adjustments", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result?.error?.message ?? "Create failed");
      }

      onCreated(result.data as ManualAdjustmentRecord);
      onPreview(null);
      setReason("");
      setEvidenceRef("");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Create failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-xl border border-border bg-panel p-3">
      <p className="mb-3 text-sm font-semibold text-text">Create Adjustment</p>
      <div className="grid gap-2 md:grid-cols-2">
        <label className="text-xs text-muted">
          Account
          <select
            value={accountId}
            onChange={(event) => {
              setAccountId(event.target.value);
              if (adjustmentType === "EXECUTION_QTY_OVERRIDE") {
                setResolvedExecution(null);
                setExecutionLookupError(null);
              }
            }}
            className="mt-1 w-full rounded border border-border bg-panel-2 px-2 py-2 text-xs text-text"
          >
            <option value="">Select account</option>
            {availableAccounts.map((value) => (
              <option key={value} value={value}>
                {getAccountDisplayText(value)}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-muted">
          Symbol
          <input
            value={symbol}
            onChange={(event) => setSymbol(event.target.value)}
            className="mt-1 w-full rounded border border-border bg-panel-2 px-2 py-2 text-xs text-text"
            placeholder="SDS"
          />
        </label>
        <label className="text-xs text-muted">
          Effective Date
          <input
            type="date"
            value={effectiveDate}
            onChange={(event) => setEffectiveDate(event.target.value)}
            readOnly={effectiveDateLocked}
            disabled={effectiveDateLocked}
            className="mt-1 w-full rounded border border-border bg-panel-2 px-2 py-2 text-xs text-text"
          />
        </label>
        <label className="text-xs text-muted">
          Type
          <select
            value={adjustmentType}
            onChange={(event) => handleAdjustmentTypeChange(event.target.value as AdjustmentType)}
            className="mt-1 w-full rounded border border-border bg-panel-2 px-2 py-2 text-xs text-text"
          >
            <option value="SPLIT">SPLIT</option>
            <option value="QTY_OVERRIDE">QTY_OVERRIDE</option>
            <option value="PRICE_OVERRIDE">PRICE_OVERRIDE</option>
            <option value="ADD_POSITION">ADD_POSITION</option>
            <option value="REMOVE_POSITION">REMOVE_POSITION</option>
            <option value="EXECUTION_QTY_OVERRIDE">EXECUTION_QTY_OVERRIDE</option>
          </select>
        </label>

        {adjustmentType === "SPLIT" ? (
          <>
            <label className="text-xs text-muted">
              Ratio From
              <input
                type="number"
                min={1}
                value={splitFrom}
                onChange={(event) => setSplitFrom(Number(event.target.value))}
                className="mt-1 w-full rounded border border-border bg-panel-2 px-2 py-2 text-xs text-text"
              />
            </label>
            <label className="text-xs text-muted">
              Ratio To
              <input
                type="number"
                min={1}
                value={splitTo}
                onChange={(event) => setSplitTo(Number(event.target.value))}
                className="mt-1 w-full rounded border border-border bg-panel-2 px-2 py-2 text-xs text-text"
              />
            </label>
          </>
        ) : adjustmentType === "EXECUTION_QTY_OVERRIDE" ? (
          <label className="text-xs text-muted md:col-span-2">
            Execution ID
            <input
              value={executionId}
              onChange={(event) => {
                setExecutionId(event.target.value);
                setResolvedExecution(null);
                setExecutionLookupError(null);
              }}
              onBlur={() => {
                void resolveExecutionId();
              }}
              className="mt-1 w-full rounded border border-border bg-panel-2 px-2 py-2 text-xs text-text"
              placeholder="clt123..."
            />
            {executionLookupError ? <span className="mt-1 block text-red-300">{executionLookupError}</span> : null}
            {executionLookupLoading ? <span className="mt-1 block text-muted">Validating execution...</span> : null}
            {executionResolved ? <span className="mt-1 block text-muted">Matched trade date {effectiveDate}.</span> : null}
          </label>
        ) : (
          <label className="text-xs text-muted md:col-span-2">
            Instrument Key
            <input
              value={instrumentKey}
              onChange={(event) => setInstrumentKey(event.target.value)}
              className="mt-1 w-full rounded border border-border bg-panel-2 px-2 py-2 text-xs text-text"
              placeholder="SDS or SPY|CALL|650|2027-12-17"
            />
          </label>
        )}

        {adjustmentType === "QTY_OVERRIDE" ? (
          <label className="text-xs text-muted">
            Override Qty
            <input
              type="number"
              value={overrideQty}
              onChange={(event) => setOverrideQty(Number(event.target.value))}
              className="mt-1 w-full rounded border border-border bg-panel-2 px-2 py-2 text-xs text-text"
            />
          </label>
        ) : null}

        {adjustmentType === "EXECUTION_QTY_OVERRIDE" ? (
          <label className="text-xs text-muted">
            Override Qty
            <input
              type="number"
              inputMode="decimal"
              required
              min={0}
              step="0.0001"
              value={executionOverrideQtyInput}
              onChange={(event) => setExecutionOverrideQtyInput(event.target.value)}
              className="mt-1 w-full rounded border border-border bg-panel-2 px-2 py-2 text-xs text-text"
              placeholder="2"
            />
          </label>
        ) : null}

        {adjustmentType === "PRICE_OVERRIDE" ? (
          <label className="text-xs text-muted">
            Override Price
            <input
              type="number"
              min={0}
              step="0.0001"
              value={overridePrice}
              onChange={(event) => setOverridePrice(Number(event.target.value))}
              className="mt-1 w-full rounded border border-border bg-panel-2 px-2 py-2 text-xs text-text"
            />
          </label>
        ) : null}

        {adjustmentType === "ADD_POSITION" ? (
          <>
            <label className="text-xs text-muted">
              Asset Class
              <select
                value={addAssetClass}
                onChange={(event) => setAddAssetClass(event.target.value as "EQUITY" | "OPTION")}
                className="mt-1 w-full rounded border border-border bg-panel-2 px-2 py-2 text-xs text-text"
              >
                <option value="EQUITY">EQUITY</option>
                <option value="OPTION">OPTION</option>
              </select>
            </label>
            <label className="text-xs text-muted">
              Net Qty
              <input
                type="number"
                value={addNetQty}
                onChange={(event) => setAddNetQty(Number(event.target.value))}
                className="mt-1 w-full rounded border border-border bg-panel-2 px-2 py-2 text-xs text-text"
              />
            </label>
            <label className="text-xs text-muted">
              Cost Basis
              <input
                type="number"
                value={addCostBasis}
                onChange={(event) => setAddCostBasis(Number(event.target.value))}
                className="mt-1 w-full rounded border border-border bg-panel-2 px-2 py-2 text-xs text-text"
              />
            </label>
            {addAssetClass === "OPTION" ? (
              <>
                <label className="text-xs text-muted">
                  Option Type
                  <select
                    value={addOptionType}
                    onChange={(event) => setAddOptionType(event.target.value as "CALL" | "PUT")}
                    className="mt-1 w-full rounded border border-border bg-panel-2 px-2 py-2 text-xs text-text"
                  >
                    <option value="CALL">CALL</option>
                    <option value="PUT">PUT</option>
                  </select>
                </label>
                <label className="text-xs text-muted">
                  Strike
                  <input
                    value={addStrike}
                    onChange={(event) => setAddStrike(event.target.value)}
                    className="mt-1 w-full rounded border border-border bg-panel-2 px-2 py-2 text-xs text-text"
                  />
                </label>
                <label className="text-xs text-muted">
                  Expiration
                  <input
                    type="date"
                    value={addExpirationDate}
                    onChange={(event) => setAddExpirationDate(event.target.value)}
                    className="mt-1 w-full rounded border border-border bg-panel-2 px-2 py-2 text-xs text-text"
                  />
                </label>
              </>
            ) : null}
          </>
        ) : null}

        <label className="text-xs text-muted md:col-span-2">
          Reason (required)
          <input
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            className="mt-1 w-full rounded border border-border bg-panel-2 px-2 py-2 text-xs text-text"
            placeholder="Corporate action reconciliation"
          />
        </label>
        <label className="text-xs text-muted md:col-span-2">
          Evidence URL
          <input
            value={evidenceRef}
            onChange={(event) => setEvidenceRef(event.target.value)}
            className="mt-1 w-full rounded border border-border bg-panel-2 px-2 py-2 text-xs text-text"
            placeholder="https://..."
          />
        </label>
        <label className="text-xs text-muted md:col-span-2">
          Created By
          <input
            value={createdBy}
            onChange={(event) => setCreatedBy(event.target.value)}
            className="mt-1 w-full rounded border border-border bg-panel-2 px-2 py-2 text-xs text-text"
          />
        </label>
      </div>

      {adjustmentType === "SPLIT" ? (
        <p className="mt-2 text-xs text-muted">
          {directionLabel(splitFrom, splitTo)} ({splitFrom}:{splitTo})
        </p>
      ) : null}

      {error ? <p className="mt-2 text-xs text-red-300">{error}</p> : null}

      <div className="mt-3 flex items-center gap-2">
        <button
          type="button"
          disabled={
            previewing ||
            !accountId ||
            !symbol ||
            !reason ||
            (adjustmentType === "EXECUTION_QTY_OVERRIDE" &&
              (!executionId.trim() ||
                !hasValidExecutionOverrideQty ||
                executionLookupLoading ||
                !!executionLookupError ||
                !executionResolved))
          }
          onClick={handlePreview}
          className="rounded border border-border bg-panel-2 px-3 py-1 text-xs text-text disabled:cursor-not-allowed disabled:opacity-50"
        >
          {previewing ? "Previewing..." : "Preview"}
        </button>
        <button
          type="button"
          disabled={
            saving ||
            !accountId ||
            !symbol ||
            !reason ||
            (adjustmentType === "EXECUTION_QTY_OVERRIDE" &&
              (!executionId.trim() ||
                !hasValidExecutionOverrideQty ||
                executionLookupLoading ||
                !!executionLookupError ||
                !executionResolved))
          }
          onClick={handleCreate}
          className="rounded border border-border bg-accent/20 px-3 py-1 text-xs text-text disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saving ? "Saving..." : "Create Adjustment"}
        </button>
      </div>
    </div>
  );
}
