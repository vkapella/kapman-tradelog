"use client";

import { createContext, useContext, useMemo, useState } from "react";

type TopbarSheetId = "range" | "accounts";

interface TopbarSheetContextValue {
  openSheet: TopbarSheetId | null;
  setOpenSheet: (sheet: TopbarSheetId | null) => void;
}

/**
 * The topbar owns which scope-selector sheet is open (#340) so only one can
 * be open at a time below md. Null context = selector falls back to its local
 * dropdown state (desktop presentation).
 */
const TopbarSheetContext = createContext<TopbarSheetContextValue | null>(null);

export function TopbarSheetProvider({ children }: { children: React.ReactNode }) {
  const [openSheet, setOpenSheet] = useState<TopbarSheetId | null>(null);
  const value = useMemo(() => ({ openSheet, setOpenSheet }), [openSheet]);
  return <TopbarSheetContext.Provider value={value}>{children}</TopbarSheetContext.Provider>;
}

export function useTopbarSheet(id: TopbarSheetId): { usingSheet: boolean; open: boolean; setOpen: (open: boolean) => void } | null {
  const context = useContext(TopbarSheetContext);
  if (context === null) {
    return null;
  }
  return {
    usingSheet: true,
    open: context.openSheet === id,
    setOpen: (open: boolean) => context.setOpenSheet(open ? id : null),
  };
}
