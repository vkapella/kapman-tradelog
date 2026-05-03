"use client";

import { useMemo } from "react";
import { usePathname } from "next/navigation";
import { AccountSelector } from "@/components/account-selector";
import { RangeSelector } from "@/components/range-selector";
import { SidebarNav } from "@/components/sidebar-nav";
import { AccountFilterContextProvider } from "@/contexts/AccountFilterContext";
import { RangeFilterProvider } from "@/contexts/RangeFilterContext";
import { getRouteTitle, getTopbarContextTags } from "@/lib/navigation";

export function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <AccountFilterContextProvider>
      <RangeFilterProvider>
        <ShellContent>{children}</ShellContent>
      </RangeFilterProvider>
    </AccountFilterContextProvider>
  );
}

function ShellContent({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const title = useMemo(() => getRouteTitle(pathname), [pathname]);
  const tags = useMemo(() => getTopbarContextTags(pathname), [pathname]);

  return (
    <div className="grid min-h-screen bg-bg" style={{ gridTemplateColumns: "var(--sidebar-w) minmax(0, 1fr)" }}>
      <aside className="flex min-h-screen flex-col border-r border-border bg-surface">
        <div className="flex items-center gap-2 border-b border-border" style={{ height: "var(--topbar-h)", padding: "0 14px" }}>
          <span className="text-[14px] font-bold text-text" style={{ fontFamily: "var(--mono)" }}>
            <span style={{ color: "var(--accent)" }}>Kap</span>Man
          </span>
          <span style={{ color: "var(--text-3)", fontFamily: "var(--mono)", fontSize: "10px" }}>
            v9.0
          </span>
        </div>
        <SidebarNav />
      </aside>

      <div className="min-w-0">
        <header
          className="flex items-center justify-between border-b border-border bg-surface"
          style={{ height: "var(--topbar-h)", padding: "0 14px" }}
        >
          <div className="flex items-center gap-2">
            <p className="text-xs font-bold text-text">{title}</p>
            <div className="flex items-center gap-1">
              {tags.map((tag) => (
                <span
                  key={tag}
                  className="border font-medium"
                  style={{
                    background: "var(--surface-3)",
                    borderColor: "var(--border)",
                    borderRadius: "var(--r-sm)",
                    color: "var(--text-2)",
                    fontSize: "10px",
                    padding: "1px 6px",
                  }}
                >
                  {tag}
                </span>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <RangeSelector />
            <AccountSelector />
          </div>
        </header>

        <main style={{ padding: 0 }}>{children}</main>
      </div>
    </div>
  );
}
