export interface NavItem {
  href: string;
  label: string;
}

export const navItems: NavItem[] = [
  { href: "/", label: "Overview" },
  { href: "/imports", label: "Imports & Connections" },
  { href: "/executions", label: "Executions" },
  { href: "/matched-lots", label: "Matched Lots" },
  { href: "/setups", label: "Setups" },
  { href: "/tts-evidence", label: "TTS Evidence" },
  { href: "/diagnostics", label: "Diagnostics" },
];
