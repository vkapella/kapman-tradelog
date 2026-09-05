import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import { RootShell } from "@/components/root-shell";
import { PROFILE_IDENTITY_HEADER } from "@/lib/auth/identity";
import "./globals.css";

export const metadata: Metadata = {
  // Window/tab title. Matches the sidebar brand ("KapMan / Tradelog"); the
  // route title helper in src/lib/navigation.ts and the manifest name agree.
  title: "KapMan Tradelog",
  description: "Containerized trading journal for imports, FIFO lots, and setup analytics.",
  // Icons come from the App Router FILE CONVENTIONS, not from metadata.icons:
  // src/app/favicon.ico, icon.png and apple-icon.png. Next emits the <link>
  // tags from those and they take precedence over anything declared here, so
  // declaring them twice only invites drift. public/apple-touch-icon.png is
  // kept as well, because iOS probes the site root for that exact filename
  // when a page has no apple-touch-icon tag. All are generated from the brand
  // mark — see design/README.md for the commands.
  appleWebApp: {
    capable: true,
    title: "Tradelog",
    statusBarStyle: "black-translucent",
  },
};

// Next 14 deprecates viewport fields inside `metadata`; typed export (#340).
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  // design-lint-allow: Next's themeColor export is serialised into a meta tag
  // at build time and cannot read CSS custom properties; tracks --surface-2.
  themeColor: "#12151c",
  colorScheme: "dark",
};

// This is a runtime, database-backed dashboard rendered per request; opt the
// whole route tree out of build-time static generation so `next build` does not
// try to prerender pages that depend on live data.
export const dynamic = "force-dynamic";

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  // Trusted identity snapshot (#344): middleware strips any inbound
  // x-kapman-user before re-setting it post-verification, so this header is
  // authoritative at render time. It bootstraps the client's profile session
  // (cache/journal addressing) independently of the profile database.
  const identity = headers().get(PROFILE_IDENTITY_HEADER);

  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Geist:wght@300;400;500;600;700&family=Geist+Mono:wght@400;500&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <RootShell identity={identity}>{children}</RootShell>
      </body>
    </html>
  );
}
