"use client";

import { useEffect, useRef, useState } from "react";

export interface InfoTooltipContent {
  formula: string;
  source: string;
  interpretation: string;
}

interface InfoTooltipProps {
  label: string;
  content: InfoTooltipContent;
}

export function InfoTooltip({ label, content }: InfoTooltipProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    function handlePointerDown(event: MouseEvent) {
      if (rootRef.current?.contains(event.target as Node)) {
        return;
      }

      setOpen(false);
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  return (
    <div
      ref={rootRef}
      className="relative"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        aria-label={`About ${label}`}
        onClick={() => setOpen((current) => !current)}
        className="flex h-5 w-5 items-center justify-center rounded-full border border-border bg-panel-2 text-[10px] text-muted hover:text-text"
      >
        ?
      </button>

      {open ? (
        <div className="absolute right-0 top-7 z-40 w-72 rounded-lg border border-border bg-panel p-3 text-left shadow-2xl">
          <p className="text-xs font-semibold text-text">{label}</p>
          <p className="mt-2 text-[11px] text-muted">
            <span className="font-semibold text-text">Formula:</span> {content.formula}
          </p>
          <p className="mt-2 text-[11px] text-muted">
            <span className="font-semibold text-text">Source:</span> {content.source}
          </p>
          <p className="mt-2 text-[11px] text-muted">
            <span className="font-semibold text-text">Interpretation:</span> {content.interpretation}
          </p>
        </div>
      ) : null}
    </div>
  );
}
