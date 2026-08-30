"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  ChartLine,
  Clock,
  FileCheck2,
  Landmark,
  LayoutGrid,
  Layers,
  Lightbulb,
  ListOrdered,
  SlidersHorizontal,
  Upload,
  type LucideIcon,
} from "lucide-react";
import { navGroups } from "@/lib/navigation";

/* UI-1: the 56px icon rail for the md:–lg: band (768–1024). Icon-only with an
 * aria-label per item; the drawer (hamburger in the topbar) remains the path
 * to full labels in this band, and the sidebar takes over at lg+.
 *
 * Icons are keyed by href here rather than added to navGroups so the shared
 * navigation registry stays presentation-free. */
const RAIL_ICONS: Record<string, LucideIcon> = {
  "/dashboard": LayoutGrid,
  "/today": Clock,
  "/analytics": ChartLine,
  "/positions": Layers,
  "/trade-records": ListOrdered,
  "/recommendations": Lightbulb,
  "/imports": Upload,
  "/accounts": Landmark,
  "/adjustments": SlidersHorizontal,
  "/tts-evidence": FileCheck2,
  "/diagnostics": Activity,
};

export function RailNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Primary"
      className="sticky top-0 hidden h-screen w-[var(--rail-w)] flex-col items-center gap-1 overflow-y-auto border-r border-border bg-surface-2 py-2 md:flex lg:hidden"
      style={{ height: "100vh", maxHeight: "100dvh", paddingTop: "calc(env(safe-area-inset-top, 0px) + 8px)" }}
    >
      {navGroups.flatMap((group, groupIndex) => {
        const items = group.items.map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(item.href + "/") || (item.href === "/dashboard" && pathname === "/");
          const Icon = RAIL_ICONS[item.href] ?? LayoutGrid;

          return (
            <Link
              key={item.href}
              href={item.href}
              aria-label={item.label}
              aria-current={isActive ? "page" : undefined}
              title={item.label}
              className="flex h-11 w-11 items-center justify-center rounded border-l-2 transition-colors hover:bg-surface-3"
              style={{
                background: isActive ? "var(--accent-dim)" : "transparent",
                borderLeftColor: isActive ? "var(--accent)" : "transparent",
                color: isActive ? "var(--accent)" : "var(--text-2)",
              }}
            >
              <Icon aria-hidden="true" className="h-5 w-5" />
            </Link>
          );
        });

        return groupIndex === 0
          ? items
          : [<div key={`divider-${group.label}`} aria-hidden="true" className="my-1 h-px w-6 bg-border" />, ...items];
      })}
    </nav>
  );
}
