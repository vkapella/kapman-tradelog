import { describe, expect, it } from "vitest";
import {
  isWithinFilterPanelBoundary,
  requestCloseColumnId,
  toggleOpenColumnId,
} from "@/components/data-table/filter-panel-interaction";

describe("filter-panel-interaction", () => {
  it("opens the requested column when none is open", () => {
    expect(toggleOpenColumnId(null, "eventTime")).toBe("eventTime");
  });

  it("closes the same column when its filter button is toggled again", () => {
    expect(toggleOpenColumnId("eventTime", "eventTime")).toBeNull();
  });

  it("switches from one open column to another", () => {
    expect(toggleOpenColumnId("eventTime", "tradeDate")).toBe("tradeDate");
  });

  it("only closes the currently open column on explicit close requests", () => {
    expect(requestCloseColumnId("eventTime", "eventTime")).toBeNull();
    expect(requestCloseColumnId("eventTime", "tradeDate")).toBe("eventTime");
  });

  it("treats anchor and panel targets as inside the interaction boundary", () => {
    const target = { id: "target" } as unknown as Node;
    const panelElement = {
      contains: (candidate: Node) => candidate === target,
    } as Pick<HTMLElement, "contains">;
    const anchorElement = {
      contains: () => false,
    } as Pick<HTMLElement, "contains">;

    expect(isWithinFilterPanelBoundary(target, panelElement, anchorElement)).toBe(true);
    expect(isWithinFilterPanelBoundary(target, null, { contains: (candidate: Node) => candidate === target })).toBe(true);
    expect(isWithinFilterPanelBoundary(target, panelElement, anchorElement)).toBe(true);
  });

  it("treats outside targets as outside the interaction boundary", () => {
    const target = { id: "outside" } as unknown as Node;
    const panelElement = {
      contains: () => false,
    } as Pick<HTMLElement, "contains">;
    const anchorElement = {
      contains: () => false,
    } as Pick<HTMLElement, "contains">;

    expect(isWithinFilterPanelBoundary(target, panelElement, anchorElement)).toBe(false);
    expect(isWithinFilterPanelBoundary(null, panelElement, anchorElement)).toBe(false);
  });
});
