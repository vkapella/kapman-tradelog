import type { Metadata } from "next";
import { RootShell } from "@/components/root-shell";
import "./globals.css";

export const metadata: Metadata = {
  title: "KapMan Trading Journal",
  description: "Containerized trading journal for imports, FIFO lots, and setup analytics.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <RootShell>{children}</RootShell>
      </body>
    </html>
  );
}
