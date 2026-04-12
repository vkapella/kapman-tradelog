export interface NavItem {
  href: string;
  label: string;
  badgeKey?: "executionCount" | "importCount";
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

export const navGroups: NavGroup[] = [
  {
    label: "WORKSPACE",
    items: [
      { href: "/dashboard", label: "Dashboard" },
      { href: "/analytics", label: "Analytics" },
      { href: "/positions", label: "Open Positions" },
    ],
  },
  {
    label: "TRADE RECORDS",
    items: [{ href: "/trade-records", label: "Executions / Lots / Setups", badgeKey: "executionCount" }],
  },
  {
    label: "IMPORT & DATA",
    items: [
      { href: "/imports", label: "Imports & Connections", badgeKey: "importCount" },
      { href: "/accounts", label: "Accounts" },
      { href: "/adjustments", label: "Adjustments" },
    ],
  },
  {
    label: "EVIDENCE & AUDIT",
    items: [
      { href: "/tts-evidence", label: "TTS Evidence" },
      { href: "/diagnostics", label: "Diagnostics" },
    ],
  },
];

export function getRouteTitle(pathname: string): string {
  const normalized = pathname === "/" ? "/dashboard" : pathname;

  for (const group of navGroups) {
    const matched = group.items.find((item) => normalized === item.href || normalized.startsWith(item.href + "/"));
    if (matched) {
      return matched.label;
    }
  }

  return "KapMan Trading Journal";
}

export function getTopbarContextTags(pathname: string): string[] {
  if (pathname.startsWith("/dashboard")) {
    return ["KPI strip", "Widget grid"];
  }

  if (pathname.startsWith("/trade-records")) {
    return ["T1", "T2", "T3"];
  }

  if (pathname.startsWith("/imports")) {
    return ["Upload", "History", "Adapters"];
  }

  if (pathname.startsWith("/positions")) {
    return ["Live marks"];
  }

  if (pathname.startsWith("/accounts")) {
    return ["Account metadata"];
  }

  if (pathname.startsWith("/analytics")) {
    return ["Derived metrics"];
  }

  if (pathname.startsWith("/adjustments")) {
    return ["Audit trail", "Overrides"];
  }

  return [];
}
