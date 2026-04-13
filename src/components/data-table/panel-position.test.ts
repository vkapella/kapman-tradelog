import { describe, expect, it } from "vitest";
import { resolvePanelPosition } from "@/components/data-table/panel-position";

describe("resolvePanelPosition", () => {
  it("right-aligns below the anchor when there is room", () => {
    expect(
      resolvePanelPosition({
        anchorRect: { top: 100, bottom: 132, left: 400, right: 440, width: 40, height: 32 },
        panelRect: { width: 280, height: 360 },
        viewportWidth: 1440,
        viewportHeight: 900,
      }),
    ).toEqual({ left: 160, top: 140 });
  });

  it("clamps horizontally to keep the panel inside the viewport", () => {
    expect(
      resolvePanelPosition({
        anchorRect: { top: 100, bottom: 132, left: 16, right: 56, width: 40, height: 32 },
        panelRect: { width: 320, height: 360 },
        viewportWidth: 800,
        viewportHeight: 900,
      }),
    ).toEqual({ left: 12, top: 140 });
  });

  it("flips above the anchor when there is not enough space below", () => {
    expect(
      resolvePanelPosition({
        anchorRect: { top: 720, bottom: 752, left: 500, right: 540, width: 40, height: 32 },
        panelRect: { width: 280, height: 240 },
        viewportWidth: 1280,
        viewportHeight: 900,
      }),
    ).toEqual({ left: 260, top: 472 });
  });

  it("clamps vertically when the panel is taller than the available space", () => {
    expect(
      resolvePanelPosition({
        anchorRect: { top: 420, bottom: 452, left: 500, right: 540, width: 40, height: 32 },
        panelRect: { width: 280, height: 760 },
        viewportWidth: 1280,
        viewportHeight: 900,
      }),
    ).toEqual({ left: 260, top: 128 });
  });
});
