"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { AccountSelector } from "@/components/account-selector";
import { BottomTabBar } from "@/components/bottom-tab-bar";
import { RangeSelector } from "@/components/range-selector";
import { BrandLockup } from "@/components/brand-lockup";
import { RailNav } from "@/components/rail-nav";
import { SidebarNav } from "@/components/sidebar-nav";
import { AccountFilterContextProvider } from "@/contexts/AccountFilterContext";
import { ProfileProvider } from "@/contexts/ProfileContext";
import { TopbarSheetProvider } from "@/contexts/TopbarSheetContext";
import { RangeFilterProvider } from "@/contexts/RangeFilterContext";
import { getRouteTitle, getTopbarContextTags } from "@/lib/navigation";

// Provider order is the two-stage hydration barrier (#344): ProfileProvider
// withholds everything until the profile resolves; AccountFilterContextProvider
// withholds the rest until the account scope is reconciled. Scope-sensitive
// consumers (RangeFilterProvider, ShellContent, pages) mount only after both.
export function RootShell({ children, identity }: { children: React.ReactNode; identity?: string | null }) {
  return (
    <ProfileProvider identity={identity}>
      <AccountFilterContextProvider>
        <RangeFilterProvider>
          <TopbarSheetProvider>
            <ShellContent identity={identity ?? null}>{children}</ShellContent>
          </TopbarSheetProvider>
        </RangeFilterProvider>
      </AccountFilterContextProvider>
    </ProfileProvider>
  );
}

type InertElement = HTMLElement & { inert: boolean };

function ShellContent({ children, identity }: { children: React.ReactNode; identity: string | null }) {
  const pathname = usePathname();
  const title = useMemo(() => getRouteTitle(pathname), [pathname]);
  const tags = useMemo(() => getTopbarContextTags(pathname), [pathname]);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const hamburgerRef = useRef<HTMLButtonElement | null>(null);
  const asideRef = useRef<HTMLElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);

  const closeDrawer = useCallback(() => setDrawerOpen(false), []);

  // Drawer lifecycle: focus placement/restoration, Escape, body scroll lock,
  // and background inertness set through refs (typed, not a string attribute).
  useEffect(() => {
    const content = contentRef.current as InertElement | null;
    if (!drawerOpen) {
      if (content) {
        content.inert = false;
      }
      return;
    }

    if (content) {
      content.inert = true;
    }
    const hamburger = hamburgerRef.current;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const firstLink = asideRef.current?.querySelector<HTMLAnchorElement>("a[href]");
    firstLink?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setDrawerOpen(false);
      }
    }
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
      if (content) {
        content.inert = false;
      }
      hamburger?.focus();
    };
  }, [drawerOpen]);

  // Transitioning to lg+ closes the drawer; the effect above restores scroll,
  // focus, and inertness through its cleanup.
  useEffect(() => {
    const mql = window.matchMedia("(min-width: 1024px)");
    function handleChange(event: MediaQueryListEvent) {
      if (event.matches) {
        setDrawerOpen(false);
      }
    }
    mql.addEventListener("change", handleChange);
    return () => mql.removeEventListener("change", handleChange);
  }, []);

  return (
    <div className="grid min-h-screen grid-cols-1 bg-bg md:grid-cols-[var(--rail-w)_minmax(0,1fr)] lg:grid-cols-[var(--sidebar-w)_minmax(0,1fr)]">
      {drawerOpen ? (
        <div
          className="fixed inset-0 z-[var(--z-drawer-scrim)] bg-[color:color-mix(in_srgb,var(--bg)_70%,transparent)] lg:hidden"
          onClick={closeDrawer}
          aria-hidden="true"
          data-drawer-scrim=""
        />
      ) : null}

      {/* One responsive aside: drawer below lg, today's static column at lg+.
          Exactly one SidebarNav mounts, so its stats fetches never duplicate.
          Dialog semantics are conditional on the drawer actually being open. */}
      <aside
        ref={asideRef}
        data-open={drawerOpen}
        {...(drawerOpen ? { role: "dialog", "aria-modal": true, "aria-label": "Navigation" } : {})}
        className={[
          // UI-1: drawer width aligned to --sidebar-w (224px) — same SidebarNav
          // content as the lg+ column, so one width serves both; no new token.
          "fixed inset-y-0 left-0 z-[var(--z-drawer)] flex w-[var(--sidebar-w)] -translate-x-full flex-col overflow-y-auto border-r border-border bg-surface-2 transition-transform",
          "data-[open=true]:translate-x-0",
          "lg:static lg:z-auto lg:min-h-screen lg:w-auto lg:translate-x-0 lg:overflow-visible",
        ].join(" ")}
        style={{ maxHeight: "100dvh", paddingTop: "env(safe-area-inset-top, 0px)", paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
      >
        <div className="flex items-center border-b border-border" style={{ minHeight: "var(--topbar-h)", padding: "6px 14px" }}>
          <BrandLockup />
        </div>
        <SidebarNav onNavigate={closeDrawer} />
      </aside>

      {/* UI-1: persistent 56px icon rail in the md:–lg: band. The aside above
          is fixed (off-canvas) below lg, so the rail is the in-flow occupant
          of the first grid column at md; at lg the aside takes over and the
          rail hides. */}
      <RailNav />

      <div ref={contentRef} data-shell-content="" className="min-w-0">
        <header
          className="sticky top-0 z-[var(--z-topbar)] border-b border-border bg-surface-2 lg:static"
          style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}
        >
          <div className="flex items-center justify-between" style={{ minHeight: "calc(var(--topbar-h) - 1px)", padding: "0 14px" }}>
            <div className="flex min-w-0 items-center gap-2">
              <button
                ref={hamburgerRef}
                type="button"
                onClick={() => setDrawerOpen(true)}
                aria-label="Open navigation"
                aria-expanded={drawerOpen}
                className="touch-target -ml-1 rounded border border-border bg-surface-3 p-1.5 text-text-2 lg:hidden"
              >
                <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4 fill-none stroke-current" strokeWidth="2" strokeLinecap="round">
                  <path d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              </button>
              {/* UI-3: the lockup is never hidden — the aside carries it at
                  lg+; below lg the topbar does. */}
              <span className="min-w-0 lg:hidden">
                <BrandLockup />
              </span>
              <p className="truncate text-xs font-bold text-text max-lg:hidden">{title}</p>
              <div className="hidden items-center gap-1 md:flex">
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
            <div className="flex min-w-0 items-center gap-2">
              <div className="hidden items-center gap-2 lg:flex">
                <RangeSelector variant="desktop" />
                <AccountSelector variant="desktop" />
              </div>
              {/* UI-3: signed-in identity, far right. Hidden below md — the ⋯
                  overflow fold the spec names does not exist as a component in
                  this repo yet; flagged rather than invented here. Sign out is
                  Cloudflare Access's own logout path on the proxied hostname. */}
              {identity ? (
              <div className="hidden min-w-0 items-center gap-2 md:flex">
                <span className="max-w-[16ch] truncate text-xs text-text-2" title={identity}>
                  {identity}
                </span>
                <a
                  href="/cdn-cgi/access/logout"
                  className="flex-none rounded border border-border bg-surface-3 px-2 py-1 text-xs text-text-2"
                >
                  Sign out
                </a>
                </div>
              ) : null}
            </div>
          </div>
          {/* Mobile scope-controls row: the two selectors that were previously
              pushed off-canvas. Auto-height; desktop keeps the exact 46px row. */}
          <div className="flex items-stretch gap-2 px-3 pb-2 lg:hidden">
            <RangeSelector />
            <AccountSelector />
          </div>
        </header>

        <main className="max-md:pb-[var(--tabbar-total)]" style={{ padding: 0 }}>{children}</main>
      </div>

      <BottomTabBar />
    </div>
  );
}
