"use client";

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";

interface MobileSheetProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}

// Body scroll lock is reference-counted at module level: stacked or duplicated
// sheets must never strand `overflow: hidden` on the body (#340 follow-up —
// two shell-mounted selector instances once double-locked and froze scrolling
// on iPhone until relaunch).
let scrollLockCount = 0;
let scrollLockPreviousOverflow = "";

function acquireScrollLock() {
  if (scrollLockCount === 0) {
    scrollLockPreviousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
  }
  scrollLockCount += 1;
}

function releaseScrollLock() {
  scrollLockCount = Math.max(0, scrollLockCount - 1);
  if (scrollLockCount === 0) {
    document.body.style.overflow = scrollLockPreviousOverflow;
  }
}

/**
 * Bottom-sheet primitive (#340). Portaled to document.body so a sticky
 * ancestor's stacking context can never trap it; layered via the sheet tokens
 * (existing modals stay above at --z-modal). Dialog semantics, Escape/scrim
 * close, focus placement + restoration, body scroll lock, dvh sizing, and
 * safe-area padding are all handled here so every sheet behaves identically.
 */
export function MobileSheet({ open, onClose, title, children }: MobileSheetProps) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    restoreFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    panelRef.current?.focus();

    acquireScrollLock();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      releaseScrollLock();
      restoreFocusRef.current?.focus();
    };
  }, [open, onClose]);

  if (!open || typeof document === "undefined") {
    return null;
  }

  return createPortal(
    <>
      <div
        className="fixed inset-0 z-[var(--z-sheet-scrim)] bg-[color:color-mix(in_srgb,var(--bg)_70%,transparent)]"
        onClick={onClose}
        aria-hidden="true"
        data-sheet-scrim=""
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        data-mobile-sheet=""
        className="fixed inset-x-0 bottom-0 z-[var(--z-sheet)] max-h-[70dvh] overflow-y-auto rounded-t-2xl border-t border-border bg-surface-2 shadow-2xl outline-none"
        style={{
          paddingBottom: "max(env(safe-area-inset-bottom, 0px), 12px)",
          paddingLeft: "max(env(safe-area-inset-left, 0px), 16px)",
          paddingRight: "max(env(safe-area-inset-right, 0px), 16px)",
        }}
      >
        <div className="sticky top-0 flex items-center justify-between bg-surface-2 pb-2 pt-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-text-2">{title}</p>
          <button type="button" onClick={onClose} className="touch-target rounded border border-border px-2 py-1 text-xs text-text" aria-label={`Close ${title}`}>
            Close
          </button>
        </div>
        {children}
      </div>
    </>,
    document.body,
  );
}
