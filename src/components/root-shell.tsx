"use client";

import { useMemo } from "react";
import { usePathname } from "next/navigation";
import { AccountSelector } from "@/components/account-selector";
import { SidebarNav } from "@/components/sidebar-nav";
import { AccountFilterContextProvider } from "@/contexts/AccountFilterContext";
import { getRouteTitle, getTopbarContextTags } from "@/lib/navigation";

export function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <AccountFilterContextProvider>
      <ShellContent>{children}</ShellContent>
    </AccountFilterContextProvider>
  );
}

function ShellContent({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const title = useMemo(() => getRouteTitle(pathname), [pathname]);
  const tags = useMemo(() => getTopbarContextTags(pathname), [pathname]);

  return (
    <div className="grid min-h-screen grid-cols-1 lg:grid-cols-[220px_1fr]">
      <aside className="border-b border-border px-4 py-5 lg:border-b-0 lg:border-r" style={{ backgroundColor: "var(--sidebar-bg)" }}>
        <div className="mb-4 flex items-center gap-3">
          <div className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-accent-2 text-xs font-bold text-bg">KM</div>
          <div>
            <p className="text-xs font-semibold text-text">KapMan Trading Journal</p>
            <p className="text-[10px] text-muted">v7.0</p>
          </div>
        </div>
        <SidebarNav />
      </aside>

      <div className="min-w-0">
        <header
          className="flex h-11 items-center justify-between border-b border-border px-4"
          style={{ backgroundColor: "rgba(18, 25, 51, 0.9)" }}
        >
          <div className="flex items-center gap-2">
            <p className="text-xs font-bold text-text">{title}</p>
            <div className="flex items-center gap-1">
              {tags.map((tag) => (
                <span key={tag} className="rounded-full bg-panel-2 px-2 py-0.5 text-[10px] text-muted">
                  {tag}
                </span>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <AccountSelector />
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="rounded-md border border-border bg-panel px-2 py-1 text-[11px] text-muted"
            >
              Refresh
            </button>
          </div>
        </header>

        <main className="p-5 lg:p-7">{children}</main>
      </div>
    </div>
  );
}
