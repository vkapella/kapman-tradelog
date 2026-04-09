import type { Metadata } from "next";
import { SidebarNav } from "@/components/sidebar-nav";
import "./globals.css";

export const metadata: Metadata = {
  title: "KapMan Trading Journal",
  description: "Containerized trading journal MVP for imports, FIFO lots, and setup analytics.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <div className="grid min-h-screen grid-cols-1 lg:grid-cols-[280px_1fr]">
          <aside className="border-b border-slate-700 bg-slate-950/80 p-6 lg:border-b-0 lg:border-r">
            <div className="rounded-2xl border border-slate-700/70 bg-slate-900/60 p-4">
              <h1 className="text-base font-semibold text-slate-100">KapMan Trading Journal</h1>
              <p className="mt-1 text-xs text-slate-300">MVP routing shell</p>
            </div>
            <div className="mt-6">
              <SidebarNav />
            </div>
          </aside>
          <main className="p-6 lg:p-10">{children}</main>
        </div>
      </body>
    </html>
  );
}
