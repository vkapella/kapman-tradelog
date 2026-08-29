"use client";

import { useSyncExternalStore } from "react";

function subscribe(query: string) {
  return (onStoreChange: () => void) => {
    const mql = window.matchMedia(query);
    mql.addEventListener("change", onStoreChange);
    return () => mql.removeEventListener("change", onStoreChange);
  };
}

/**
 * The one sanctioned matchMedia/useSyncExternalStore use (#340): the
 * dropdown-vs-sheet presentation switch genuinely requires JS. Server snapshot
 * is false, so SSR renders the (closed) desktop presentation for both — the
 * switch applies post-hydration and both presentations render closed panels
 * identically, so there is no visible hydration mismatch.
 */
export function useIsBelowMd(): boolean {
  return useSyncExternalStore(subscribe("(max-width: 767px)"), () => window.matchMedia("(max-width: 767px)").matches, () => false);
}
