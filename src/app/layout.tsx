import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import { RootShell } from "@/components/root-shell";
import { PROFILE_IDENTITY_HEADER } from "@/lib/auth/identity";
import "./globals.css";

export const metadata: Metadata = {
  title: "KapMan Trading Journal",
  description: "Containerized trading journal for imports, FIFO lots, and setup analytics.",
  appleWebApp: {
    capable: true,
    title: "KapMan",
    statusBarStyle: "black-translucent",
  },
};

// Next 14 deprecates viewport fields inside `metadata`; typed export (#340).
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#111318",
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
