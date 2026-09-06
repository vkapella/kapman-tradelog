// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { buildPositionsColumnConfigs, type PositionsRow } from "@/app/positions/columns";

afterEach(cleanup);

// The seeded database renders no open positions, so the symbol column's link
// (decisions 64–66) is pinned here rather than measured on the built page.
describe("positions symbol column", () => {
  it("renders the underlying as a .km-sym-link inside a flex cell that fills its grid item", () => {
    const configs = buildPositionsColumnConfigs(() => "acct", () => false);
    const symbol = configs.find((c) => c.definition.id === "symbol");
    expect(symbol).toBeDefined();
    const row = { underlyingSymbol: "NVDA", symbol: "NVDA 250117C00130000", assetClass: "OPTION" } as unknown as PositionsRow;
    const { container } = render(<>{symbol!.renderCell(row)}</>);
    const link = screen.getByRole("link", { name: "Open NVDA chart on Barchart" });
    expect(link).toHaveClass("km-sym-link");
    expect(link).toHaveAttribute("href", "https://www.barchart.com/stocks/quotes/NVDA/interactive-chart");
    expect(link.textContent).toBe("NVDA");
    const cell = container.firstElementChild as HTMLElement;
    expect(cell.className).toContain("flex");
    expect(cell.className).toContain("h-full");
    expect(cell.className).not.toContain("py-2");
  });
});
