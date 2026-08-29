// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MobileSheet } from "@/components/overlay/MobileSheet";

describe("MobileSheet", () => {
  beforeEach(() => {
    document.body.style.overflow = "";
  });
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("portals a dialog to document.body with focus placement, and restores on close", async () => {
    const onClose = vi.fn();
    const outside = document.createElement("button");
    outside.textContent = "opener";
    document.body.appendChild(outside);
    outside.focus();

    const { rerender } = render(
      <MobileSheet open onClose={onClose} title="Date range">
        <p>content</p>
      </MobileSheet>,
    );

    const dialog = screen.getByRole("dialog", { name: "Date range" });
    expect(dialog.parentElement).toBe(document.body);
    expect(document.activeElement).toBe(dialog);
    expect(document.body.style.overflow).toBe("hidden");

    rerender(
      <MobileSheet open={false} onClose={onClose} title="Date range">
        <p>content</p>
      </MobileSheet>,
    );
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.body.style.overflow).toBe("");
    expect(document.activeElement).toBe(outside);
    outside.remove();
  });

  it("never strands the body scroll lock when two sheets stack (the iPhone frozen-scroll regression)", () => {
    const { rerender } = render(
      <>
        <MobileSheet open onClose={() => {}} title="A"><p>a</p></MobileSheet>
        <MobileSheet open onClose={() => {}} title="B"><p>b</p></MobileSheet>
      </>,
    );
    expect(document.body.style.overflow).toBe("hidden");

    rerender(
      <>
        <MobileSheet open={false} onClose={() => {}} title="A"><p>a</p></MobileSheet>
        <MobileSheet open={false} onClose={() => {}} title="B"><p>b</p></MobileSheet>
      </>,
    );
    // Reference counting: whichever cleanup runs last, the lock fully releases.
    expect(document.body.style.overflow).toBe("");
  });

  it("keeps the lock while one of two stacked sheets remains open", () => {
    const { rerender } = render(
      <>
        <MobileSheet open onClose={() => {}} title="A"><p>a</p></MobileSheet>
        <MobileSheet open onClose={() => {}} title="B"><p>b</p></MobileSheet>
      </>,
    );
    rerender(
      <>
        <MobileSheet open={false} onClose={() => {}} title="A"><p>a</p></MobileSheet>
        <MobileSheet open onClose={() => {}} title="B"><p>b</p></MobileSheet>
      </>,
    );
    expect(document.body.style.overflow).toBe("hidden");
    rerender(
      <>
        <MobileSheet open={false} onClose={() => {}} title="A"><p>a</p></MobileSheet>
        <MobileSheet open={false} onClose={() => {}} title="B"><p>b</p></MobileSheet>
      </>,
    );
    expect(document.body.style.overflow).toBe("");
  });

  it("closes on Escape and on scrim click", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <MobileSheet open onClose={onClose} title="Accounts">
        <p>content</p>
      </MobileSheet>,
    );

    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(1);

    const scrim = document.querySelector("[data-sheet-scrim]") as HTMLElement;
    await user.click(scrim);
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
