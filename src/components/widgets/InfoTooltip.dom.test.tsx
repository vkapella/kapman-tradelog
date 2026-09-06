// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { InfoTooltip } from "@/components/widgets/InfoTooltip";

// #375: on a phone the "?" in a left-hand tile opened a 288px panel that hung
// off the left edge of the screen. The panel must stay inside the viewport
// wherever the anchor is, and flip above the anchor when there is no room below.

const CONTENT = { formula: "f", source: "s", interpretation: "i" };
// A real tap has no hover; with hover simulated, mouseenter opens and the click
// toggles it shut again, which is the desktop mouse behaviour, not the bug.
const user = userEvent.setup({ skipHover: true });

function stubRects(anchor: { left: number; top: number }, panelHeight: number) {
  const size = 20;
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
    if (this.tagName === "BUTTON") {
      return {
        left: anchor.left,
        right: anchor.left + size,
        top: anchor.top,
        bottom: anchor.top + size,
        width: size,
        height: size,
        x: anchor.left,
        y: anchor.top,
        toJSON: () => ({}),
      } as DOMRect;
    }
    return { left: 0, right: 288, top: 0, bottom: panelHeight, width: 288, height: panelHeight, x: 0, y: 0, toJSON: () => ({}) } as DOMRect;
  });
}

function setViewport(width: number, height: number) {
  Object.defineProperty(window, "innerWidth", { configurable: true, value: width });
  Object.defineProperty(window, "innerHeight", { configurable: true, value: height });
}

describe("InfoTooltip placement", () => {
  beforeEach(() => {
    setViewport(390, 800);
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("keeps the panel inside a 390px viewport when the anchor sits near the left edge", async () => {
    stubRects({ left: 60, top: 500 }, 160);
    render(<InfoTooltip label="Lots" content={CONTENT} />);

    await user.click(screen.getByRole("button", { name: "About Lots" }));

    const panel = screen.getByTestId("info-tooltip-panel");
    const left = Number.parseFloat(panel.style.left);
    const width = Number.parseFloat(panel.style.width);
    expect(panel.className).toContain("fixed");
    expect(left).toBeGreaterThanOrEqual(12);
    expect(left + width).toBeLessThanOrEqual(390);
    expect(panel.style.visibility).not.toBe("hidden");
  });

  it("opens below the anchor when there is room, and flips above it when there is not", async () => {
    stubRects({ left: 300, top: 100 }, 160);
    const { unmount } = render(<InfoTooltip label="Avg MFE" content={CONTENT} />);
    await user.click(screen.getByRole("button", { name: "About Avg MFE" }));
    expect(Number.parseFloat(screen.getByTestId("info-tooltip-panel").style.top)).toBeGreaterThan(100);
    unmount();
    vi.restoreAllMocks();

    stubRects({ left: 300, top: 760 }, 160);
    render(<InfoTooltip label="Avg MAE" content={CONTENT} />);
    await user.click(screen.getByRole("button", { name: "About Avg MAE" }));
    expect(Number.parseFloat(screen.getByTestId("info-tooltip-panel").style.top)).toBeLessThan(760);
  });

  it("shrinks the panel on a viewport narrower than the panel plus padding", async () => {
    setViewport(300, 800);
    stubRects({ left: 10, top: 200 }, 160);
    render(<InfoTooltip label="Lots" content={CONTENT} />);

    await user.click(screen.getByRole("button", { name: "About Lots" }));

    const panel = screen.getByTestId("info-tooltip-panel");
    expect(Number.parseFloat(panel.style.width)).toBe(276);
    expect(Number.parseFloat(panel.style.left)).toBe(12);
  });
});
