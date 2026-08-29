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

function mockMatchMedia() {
  const mql = {
    matches: false,
    media: "",
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  };
  vi.stubGlobal("matchMedia", vi.fn().mockReturnValue(mql));
  window.matchMedia = globalThis.matchMedia as typeof window.matchMedia;
}

describe("RootShell drawer", () => {
  beforeEach(() => {
    mockMatchMedia();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, json: async () => ({}) }));
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

    await user.click(screen.getByRole("button", { name: "Open navigation" }));
    const aside = document.querySelector("aside") as HTMLElement;
    expect(aside.getAttribute("data-open")).toBe("true");

    // Dashboard is the active route; tapping it must still close the drawer.
    const dashboardLinks = screen.getAllByRole("link", { name: /Dashboard/ });
    const drawerDashboard = dashboardLinks.find((link) => aside.contains(link));
    await user.click(drawerDashboard as HTMLElement);
    await waitFor(() => expect(aside.getAttribute("data-open")).toBe("false"));
  });

  it("mounts exactly one SidebarNav (no duplicated stats fetches)", () => {
    render(<RootShell><p>page content</p></RootShell>);
    expect(document.querySelectorAll("aside").length).toBe(1);
  });
});
