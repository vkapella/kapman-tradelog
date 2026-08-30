"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BOTTOM_TABS, resolveActiveTab } from "@/lib/navigation";

const TAB_ICONS: Record<string, React.ReactNode> = {
  "/dashboard": (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5 fill-none stroke-current" strokeWidth="1.8">
      <rect x="3.5" y="3.5" width="7" height="7" rx="1.5" /><rect x="13.5" y="3.5" width="7" height="7" rx="1.5" />
      <rect x="3.5" y="13.5" width="7" height="7" rx="1.5" /><rect x="13.5" y="13.5" width="7" height="7" rx="1.5" />
    </svg>
  ),
  "/today": (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5 fill-none stroke-current" strokeWidth="1.8">
      <circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  "/positions": (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5 fill-none stroke-current" strokeWidth="1.8">
      <path d="M12 3.5l8 4-8 4-8-4 8-4z" strokeLinejoin="round" /><path d="M4 12l8 4 8-4M4 16.5l8 4 8-4" strokeLinejoin="round" />
    </svg>
  ),
  "/recommendations": (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5 fill-none stroke-current" strokeWidth="1.8">
      <path d="M9 18h6M10 21h4M12 3.5a6 6 0 0 1 3.7 10.7c-.7.6-1.2 1.4-1.2 2.3H9.5c0-.9-.5-1.7-1.2-2.3A6 6 0 0 1 12 3.5z" strokeLinejoin="round" />
    </svg>
  ),
  "/analytics": (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5 fill-none stroke-current" strokeWidth="1.8">
      <path d="M4 20h16" strokeLinecap="round" /><path d="M6 16l4-5 3.5 3L18 7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
};

/** Phone-only five-slot tab bar (#340, fixed decision). Hidden at md+. */
export function BottomTabBar() {
  const pathname = usePathname();
  const active = resolveActiveTab(pathname);

  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-[var(--z-tabbar)] border-t border-border bg-surface-2 md:hidden"
      style={{
        paddingBottom: "env(safe-area-inset-bottom, 0px)",
        paddingLeft: "max(env(safe-area-inset-left, 0px), 8px)",
        paddingRight: "max(env(safe-area-inset-right, 0px), 8px)",
      }}
    >
      <div className="grid grid-cols-5" style={{ height: "var(--tabbar-h)" }}>
        {BOTTOM_TABS.map((tab) => {
          const isActive = active === tab.href;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              aria-current={isActive ? "page" : undefined}
              className={["flex flex-col items-center justify-center gap-0.5", isActive ? "text-accent" : "text-text-2"].join(" ")}
            >
              {TAB_ICONS[tab.href]}
              <span className="text-[10px] font-medium">{tab.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
