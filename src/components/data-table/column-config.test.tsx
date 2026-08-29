import { describe, expect, it } from "vitest";
import { buildPositionsColumnConfigs } from "@/app/positions/columns";
import {
  configCellClass,
  deriveDefinitions,
  deriveHiddenActiveState,
  desktopColumnIds,
  desktopTemplate,
  detailConfigs,
  mobileColumnIds,
  mobileTemplate,
  visibleConfigsFor,
  type TableColumnConfig,
} from "@/components/data-table/column-config";
import { detailsColumnConfig } from "@/components/data-table/details-column";

type Row = { id: string };

function config(id: string, overrides: Partial<TableColumnConfig<Row>> = {}): TableColumnConfig<Row> {
  return { definition: { id, label: id }, width: "100px", renderCell: () => id, ...overrides };
}

describe("column-config derivations", () => {
  const configs: TableColumnConfig<Row>[] = [
    config("a"),
    config("b", { tier: 2, width: "minmax(320px, 1fr)" }),
    config("c", { mobileWidth: "minmax(44px, auto)" }),
    detailsColumnConfig<Row>(() => {}),
  ];

  it("derives ID-based alignment: template and column ids come from the exact same filtered array, per breakpoint", () => {
    const visible = visibleConfigsFor(configs, deriveDefinitions(configs));
    // Desktop: mobileOnly (Details) excluded; spaced widths like minmax(...) are
    // never split-counted — alignment is asserted on IDs, not track strings.
    expect(desktopColumnIds(visible)).toEqual(["a", "b", "c"]);
    expect(desktopTemplate(visible)).toBe("100px minmax(320px, 1fr) 100px");
    // Mobile: tier-2 excluded, mobileOnly included, mobileWidth honored.
    expect(mobileColumnIds(visible)).toEqual(["a", "c", "__details"]);
    expect(mobileTemplate(visible)).toBe("100px minmax(44px, auto) 44px");
  });

  it("composes persisted hidden columns with tiers (mobile = persisted-visible ∩ tier-1)", () => {
    const visibleColumns = deriveDefinitions(configs).filter((definition) => definition.id !== "c");
    const visible = visibleConfigsFor(configs, visibleColumns);
    expect(mobileColumnIds(visible)).toEqual(["a", "__details"]);
    expect(desktopColumnIds(visible)).toEqual(["a", "b"]);
  });

  it("derives detail-sheet fields from the COMPLETE config array so user-hidden columns stay reachable, excluding only includeInDetails: false", () => {
    const detailIds = detailConfigs(configs).map((entry) => entry.definition.id);
    expect(detailIds).toEqual(["a", "b", "c"]); // hidden-on-desktop "c" reachable; Details action excluded
  });

  it("emits the responsive cell classes that make display:none carry the alignment", () => {
    expect(configCellClass(config("x"))).toBe("");
    expect(configCellClass(config("x", { tier: 2 }))).toBe("max-md:hidden");
    expect(configCellClass(config("x", { mobileOnly: true }))).toBe("md:hidden");
  });

  it("pins stickyLeft columns with an opaque body background and an inherited header background", () => {
    expect(configCellClass(config("x", { stickyLeft: true }))).toBe("sticky left-0 z-[1] bg-surface");
    expect(configCellClass(config("x", { stickyLeft: true }), "header")).toBe("sticky left-0 z-[1] bg-inherit");
    expect(configCellClass(config("x", { stickyLeft: true, tier: 2 }))).toBe("max-md:hidden sticky left-0 z-[1] bg-surface");
  });

  it("surfaces active sort/filter on columns invisible below md, and only those", () => {
    const hidden = deriveHiddenActiveState(configs, deriveDefinitions(configs), { columnId: "b", direction: "desc" }, { b: ["x"], a: ["y"] });
    expect(hidden.sortColumnId).toBe("b");
    expect(hidden.sortLabel).toContain("b");
    expect(hidden.filters).toEqual([{ columnId: "b", label: "b", count: 1 }]);
  });

  it("treats a user-hidden tier-1 column's active filter as hidden state too", () => {
    const visibleColumns = deriveDefinitions(configs).filter((definition) => definition.id !== "a");
    const hidden = deriveHiddenActiveState(configs, visibleColumns, { columnId: null, direction: null }, { a: ["y"] });
    expect(hidden.filters.map((entry) => entry.columnId)).toEqual(["a"]);
  });
});

describe("positions configs (approved tier-1: Symbol, Qty, Mark, Unrealized P&L, P&L%)", () => {
  const configs = [...buildPositionsColumnConfigs(() => "acct", () => false), detailsColumnConfig<never>(() => {})];

  it("mobile shows exactly the approved tier-1 set plus the Details action", () => {
    const visible = visibleConfigsFor(configs, deriveDefinitions(configs));
    expect(mobileColumnIds(visible)).toEqual(["symbol", "netQty", "mark", "unrealizedPnl", "pnlPct", "__details"]);
  });

  it("desktop keeps all fourteen data columns and excludes the mobile-only Details action", () => {
    const visible = visibleConfigsFor(configs, deriveDefinitions(configs));
    expect(desktopColumnIds(visible)).toHaveLength(14);
    expect(desktopColumnIds(visible)).not.toContain("__details");
  });

  it("every data column is reachable from the detail sheet; the Details action is not", () => {
    const detailIds = detailConfigs(configs).map((entry) => entry.definition.id);
    expect(detailIds).toHaveLength(14);
    expect(detailIds).not.toContain("__details");
  });
});
