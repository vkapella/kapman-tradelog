"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { navItems } from "@/lib/navigation";

export function SidebarNav() {
  const pathname = usePathname();

  return (
    <nav className="space-y-2">
      {navItems.map((item) => {
        const isActive = pathname === item.href;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={[
              "block rounded-xl border px-3 py-2 text-sm transition-colors",
              isActive
                ? "border-blue-300/50 bg-blue-500/20 text-white"
                : "border-transparent text-slate-300 hover:border-slate-700 hover:bg-slate-900/50",
            ].join(" ")}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
