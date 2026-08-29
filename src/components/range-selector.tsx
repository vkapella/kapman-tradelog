"use client";

import { useContext, useEffect, useRef, useState } from "react";
import { MobileSheet } from "@/components/overlay/MobileSheet";
import { RangeFilterContext, type RangePreset } from "@/contexts/RangeFilterContext";
import { useTopbarSheet } from "@/contexts/TopbarSheetContext";
import { useIsBelowMd } from "@/hooks/useBreakpoint";

export const RANGE_PRESETS: Array<{ value: RangePreset; label: string }> = [
  { value: "kapman-start", label: "Kapman Start" },
  { value: "all", label: "All Time" },
  { value: "ytd", label: "YTD" },
  { value: "1yr", label: "1 yr" },
  { value: "3yr", label: "3 yr" },
  { value: "30d", label: "30d" },
  { value: "7d", label: "7d" },
  { value: "custom", label: "Custom" },
];

export function RangeSelector({ variant = "mobile" }: { variant?: "desktop" | "mobile" } = {}) {
  const { range, setPreset, setCustomRange, displayText } = useContext(RangeFilterContext);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [localOpen, setLocalOpen] = useState(false);
  const sheet = useTopbarSheet("range");
  const belowMd = useIsBelowMd();
  // Below md with a topbar provider present, presentation switches to a
  // body-portaled bottom sheet and open-state is owned by the topbar so only
  // one scope selector can be open at a time (#340).
  // The desktop topbar row mounts a second, CSS-hidden instance; it must
  // NEVER present a sheet or two portals would stack and fight over the
  // scroll lock and focus restore. Only the mobile-row instance is
  // sheet-capable, and only below md.
  const usingSheet = variant === "mobile" && belowMd && sheet !== null;
  const open = usingSheet ? sheet.open : localOpen;
  const setOpen = usingSheet ? sheet.setOpen : setLocalOpen;
  const [draftStartDate, setDraftStartDate] = useState("");
  const [draftEndDate, setDraftEndDate] = useState("");
  const [showCustomForm, setShowCustomForm] = useState(false);

  useEffect(() => {
    if (!open || usingSheet) {
      return;
    }

    function handleOutside(event: MouseEvent) {
      if (!containerRef.current) {
        return;
      }

      if (!containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, [open, usingSheet, setOpen]);

  function handlePresetClick(preset: RangePreset) {
    if (preset === "custom") {
      setShowCustomForm(true);
      setDraftStartDate(range.preset === "custom" ? (range.startDate ?? "") : "");
      setDraftEndDate(range.preset === "custom" ? (range.endDate ?? "") : "");
      return;
    }

    setPreset(preset);
    setShowCustomForm(false);
    setOpen(false);
  }

  function handleCancel() {
    setShowCustomForm(false);
    setDraftStartDate("");
    setDraftEndDate("");
    setOpen(false);
  }

  const canApplyCustom = draftStartDate.length > 0 && draftEndDate.length > 0 && draftStartDate <= draftEndDate;

  const panelBody = (
    <>
          <div role="radiogroup" aria-label="Date range" className="flex flex-wrap gap-1">
            {RANGE_PRESETS.map((preset) => {
              const selected = preset.value === range.preset || (preset.value === "custom" && showCustomForm);
              return (
                <button
                  key={preset.value}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => handlePresetClick(preset.value)}
                  className="rounded-md border px-2 py-1 text-xs font-medium"
                  style={{
                    borderColor: selected ? "var(--accent)" : "var(--border)",
                    background: selected ? "var(--accent)" : "var(--surface)",
                    color: selected ? "var(--bg)" : "var(--text)",
                  }}
                >
                  {preset.label}
                </button>
              );
            })}
          </div>

          {showCustomForm ? (
            <div className="mt-3 space-y-3 rounded-lg border border-border bg-surface p-3">
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <label htmlFor="range-from" className="text-xs text-text-2">
                    From
                  </label>
                  <input
                    id="range-from"
                    type="date"
                    value={draftStartDate}
                    onChange={(event) => setDraftStartDate(event.target.value)}
                    className="w-full rounded-md border border-border bg-surface-2 px-2 py-1 text-xs text-text"
                  />
                </div>
                <div className="space-y-1">
                  <label htmlFor="range-to" className="text-xs text-text-2">
                    To
                  </label>
                  <input
                    id="range-to"
                    type="date"
                    value={draftEndDate}
                    onChange={(event) => setDraftEndDate(event.target.value)}
                    className="w-full rounded-md border border-border bg-surface-2 px-2 py-1 text-xs text-text"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <button type="button" onClick={handleCancel} className="rounded-md border border-border px-2 py-1 text-xs text-text">
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={!canApplyCustom}
                  onClick={() => {
                    setCustomRange(draftStartDate, draftEndDate);
                    setShowCustomForm(false);
                    setOpen(false);
                  }}
                  className="rounded-md px-2 py-1 text-xs font-medium disabled:cursor-not-allowed disabled:opacity-50"
                  style={{ background: "var(--accent)", color: "var(--bg)" }}
                >
                  Apply
                </button>
              </div>
            </div>
          ) : null}
    </>
  );

  return (
    <div ref={containerRef} className="relative max-lg:min-w-0 max-lg:flex-1">
      <button
        type="button"
        aria-haspopup="true"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="touch-target w-full truncate rounded-lg border border-border bg-surface px-3 py-2 text-xs font-medium text-text lg:w-auto"
      >
        <span className="text-text-2">Range:&nbsp;</span>{displayText}
      </button>

      {usingSheet ? (
        <MobileSheet open={open} onClose={() => setOpen(false)} title="Date range">
          <div className="p-1">{panelBody}</div>
        </MobileSheet>
      ) : open ? (
        <div className="absolute right-0 z-[var(--z-page-controls)] mt-2 w-[360px] rounded-xl border border-border bg-surface-2 p-3 shadow-2xl">
          {panelBody}
        </div>
      ) : null}
    </div>
  );
}
