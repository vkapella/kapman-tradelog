import type { Metadata } from "next";
import { RootShell } from "@/components/root-shell";
import "./globals.css";

export const metadata: Metadata = {
  title: "KapMan Trading Journal",
  description: "Containerized trading journal for imports, FIFO lots, and setup analytics.",
};

// This is a runtime, database-backed dashboard rendered per request; opt the
// whole route tree out of build-time static generation so `next build` does not
// try to prerender pages that depend on live data.
export const dynamic = "force-dynamic";

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
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
        <RootShell>{children}</RootShell>
      </body>
    </html>
  );
}
