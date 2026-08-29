// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RootShell } from "@/components/root-shell";

vi.mock("next/navigation", () => ({
  usePathname: () => "/dashboard",
}));
vi.mock("next/link", () => ({
  default: ({ href, children, onClick, ...rest }: { href: string; children: React.ReactNode; onClick?: () => void }) => (
    <a href={href} onClick={(event) => { event.preventDefault(); onClick?.(); }} {...rest}>{children}</a>
  ),
}));

function mockMatchMedia(phone = false) {
  vi.stubGlobal(
    "matchMedia",
    vi.fn().mockImplementation((query: string) => ({
      // Phone mode: max-width queries match, min-width queries don't.
      matches: phone ? query.includes("max-width") : false,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  );
  window.matchMedia = globalThis.matchMedia as typeof window.matchMedia;
}

describe("RootShell drawer", () => {
  beforeEach(() => {
    mockMatchMedia();
    // The shell now sits behind the two-stage hydration barrier (#344): the
    // profile GET and a SUCCESSFUL /api/accounts response must both resolve
    // before ShellContent mounts. A zero-account success opens the barrier.
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async (url: unknown) => {
        const u = String(url);
        if (u.startsWith("/api/profile")) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              data: {
                email: "dev@local",
                settings: {
                  version: 1,
                  accounts: { selected: ["18528700SCHW"] },
                  range: { preset: "kapman-start", startDate: null, endDate: null },
                  dashboard: { widgets: null, kpis: null },
                  tables: { hiddenColumns: {} },
                },
                isDefault: true,
                writable: true,
                revision: "0",
                updatedAt: null,
              },
            }),
          };
        }
        if (u.startsWith("/api/accounts")) {
          return {
            ok: true,
            status: 200,
            json: async () => ({ data: [], meta: { total: 0, page: 1, pageSize: 0 } }),
          };
        }
        return { ok: false, status: 500, json: async () => ({}) };
      }),
    );
    document.body.style.overflow = "";
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("applies dialog semantics only while open, locks scroll, sets inertness via refs, and restores on close", async () => {
    const user = userEvent.setup();
    render(<RootShell><p>page content</p></RootShell>);
    await screen.findByRole("button", { name: "Open navigation" });

    const aside = document.querySelector("aside") as HTMLElement;
    expect(aside.getAttribute("role")).toBeNull();
    expect(aside.getAttribute("data-open")).toBe("false");

    const hamburger = screen.getByRole("button", { name: "Open navigation" });
    await user.click(hamburger);

    expect(aside.getAttribute("role")).toBe("dialog");
    expect(aside.getAttribute("aria-modal")).toBe("true");
    expect(aside.getAttribute("data-open")).toBe("true");
    expect(document.body.style.overflow).toBe("hidden");
    const content = document.querySelector("[data-shell-content]") as HTMLElement & { inert: boolean };
    expect(content.inert).toBe(true);

    await user.keyboard("{Escape}");
    await waitFor(() => expect(aside.getAttribute("data-open")).toBe("false"));
    expect(aside.getAttribute("role")).toBeNull();
    expect(document.body.style.overflow).toBe("");
    expect(content.inert).toBe(false);
    expect(document.activeElement).toBe(hamburger);
  });

  it("closes the drawer on any nav link tap, including the already-active route", async () => {
    const user = userEvent.setup();
    render(<RootShell><p>page content</p></RootShell>);

    await user.click(await screen.findByRole("button", { name: "Open navigation" }));
    const aside = document.querySelector("aside") as HTMLElement;
    expect(aside.getAttribute("data-open")).toBe("true");

    // Dashboard is the active route; tapping it must still close the drawer.
    const dashboardLinks = screen.getAllByRole("link", { name: /Dashboard/ });
    const drawerDashboard = dashboardLinks.find((link) => aside.contains(link));
    await user.click(drawerDashboard as HTMLElement);
    await waitFor(() => expect(aside.getAttribute("data-open")).toBe("false"));
  });

  it("opens exactly ONE accounts sheet on phones and releases the scroll lock on close (frozen-dashboard regression)", async () => {
    mockMatchMedia(true);
    const user = userEvent.setup();
    render(<RootShell><p>page content</p></RootShell>);

    const accountButtons = await screen.findAllByRole("button", { name: /Accounts:/ });
    // Two instances mount (desktop row CSS-hidden + mobile row); tap the mobile one.
    await user.click(accountButtons[accountButtons.length - 1]);
    await waitFor(() => expect(document.querySelectorAll("[data-mobile-sheet]").length).toBe(1));
    expect(document.body.style.overflow).toBe("hidden");

    await user.click(screen.getByRole("button", { name: "Close Account filter" }));
    await waitFor(() => expect(document.querySelectorAll("[data-mobile-sheet]").length).toBe(0));
    expect(document.body.style.overflow).toBe("");
  });

  it("mounts exactly one SidebarNav (no duplicated stats fetches)", async () => {
    render(<RootShell><p>page content</p></RootShell>);
    await screen.findByRole("button", { name: "Open navigation" });
    expect(document.querySelectorAll("aside").length).toBe(1);
  });
});
