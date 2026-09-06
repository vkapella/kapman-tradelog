"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { resolvePanelPosition } from "@/components/data-table/panel-position";

export interface InfoTooltipContent {
  formula: string;
  source: string;
  interpretation: string;
}

interface InfoTooltipProps {
  label: string;
  content: InfoTooltipContent;
}

/** Preferred panel width; shrinks on viewports that cannot hold it plus padding. */
const PANEL_WIDTH = 288;
const VIEWPORT_PADDING = 12;

interface PanelPlacement {
  left: number;
  top: number;
  width: number;
}

export function InfoTooltip({ label, content }: InfoTooltipProps) {
  const [open, setOpen] = useState(false);
  const [placement, setPlacement] = useState<PanelPlacement | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);

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

  // The panel is positioned `fixed` from the button's live rect and clamped to
  // the viewport (#375). Anchoring it `absolute right-0` pushed a 288px panel
  // off the left edge whenever the "?" sat in a left-hand tile on a phone, so
  // only the trailing words of each line were readable. Same helper the column
  // filter panel uses, so both popovers place themselves by one rule.
  useLayoutEffect(() => {
    if (!open) {
      setPlacement(null);
      return;
    }

    function updatePlacement() {
      const button = buttonRef.current;
      const panel = panelRef.current;
      if (!button || !panel) {
        return;
      }
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      const width = Math.min(PANEL_WIDTH, Math.max(160, viewportWidth - VIEWPORT_PADDING * 2));
      const anchorRect = button.getBoundingClientRect();
      const panelHeight = panel.getBoundingClientRect().height;
      const position = resolvePanelPosition({
        anchorRect,
        panelRect: { width, height: panelHeight },
        viewportWidth,
        viewportHeight,
        padding: VIEWPORT_PADDING,
      });
      setPlacement({ left: position.left, top: position.top, width });
    }

    updatePlacement();
    window.addEventListener("resize", updatePlacement);
    window.addEventListener("scroll", updatePlacement, true);
    return () => {
      window.removeEventListener("resize", updatePlacement);
      window.removeEventListener("scroll", updatePlacement, true);
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
        ref={buttonRef}
        type="button"
        aria-label={`About ${label}`}
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        className="touch-target flex h-5 w-5 items-center justify-center rounded-full border border-border bg-surface-3 text-[10px] text-text-2 hover:text-text"
      >
        ?
      </button>

      {open ? (
        <div
          ref={panelRef}
          role="tooltip"
          data-testid="info-tooltip-panel"
          className="fixed z-[var(--z-page-controls)] rounded-lg border border-border bg-surface-2 p-3 text-left shadow-2xl"
          style={
            placement
              ? { left: placement.left, top: placement.top, width: placement.width }
              : // First paint, before measurement: keep it on screen and invisible.
                { left: VIEWPORT_PADDING, top: VIEWPORT_PADDING, width: PANEL_WIDTH, visibility: "hidden" }
          }
        >
          <p className="text-xs font-semibold text-text">{label}</p>
          <p className="mt-2 text-[11px] text-text-2">
            <span className="font-semibold text-text">Formula:</span> {content.formula}
          </p>
          <p className="mt-2 text-[11px] text-text-2">
            <span className="font-semibold text-text">Source:</span> {content.source}
          </p>
          <p className="mt-2 text-[11px] text-text-2">
            <span className="font-semibold text-text">Interpretation:</span> {content.interpretation}
          </p>
        </div>
      ) : null}
    </div>
  );
}
