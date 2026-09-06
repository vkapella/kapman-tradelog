// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SymbolLink, chartUrl } from "@/components/symbol-link";

afterEach(cleanup);

describe("SymbolLink (decisions 64–66)", () => {
  it("builds the family chart URL with the symbol encoded (decision 66)", () => {
    expect(chartUrl("NVDA")).toBe("https://www.barchart.com/stocks/quotes/NVDA/interactive-chart");
    expect(chartUrl("BRK/B")).toBe("https://www.barchart.com/stocks/quotes/BRK%2FB/interactive-chart");
  });

  it("renders the theme primitive with the destination in its accessible name, a new tab, and no opener", () => {
    render(<SymbolLink symbol="NVDA" className="font-mono" />);
    const link = screen.getByRole("link", { name: "Open NVDA chart on Barchart" });
    expect(link).toHaveAttribute("href", chartUrl("NVDA"));
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
    expect(link.className).toBe("km-sym-link font-mono");
    expect(link.textContent).toBe("NVDA");
  });

  it("links the underlying when the displayed symbol is an option (decision 65)", () => {
    render(<SymbolLink symbol="NVDA 250117C00130000" chartSymbol="NVDA" />);
    const link = screen.getByRole("link", { name: "Open NVDA chart on Barchart" });
    expect(link).toHaveAttribute("href", chartUrl("NVDA"));
    expect(link.textContent).toBe("NVDA 250117C00130000");
  });

  it("never fires the row's own action (decision 64)", async () => {
    const onRowClick = vi.fn();
    render(
      <div onClick={onRowClick} data-testid="row">
        <SymbolLink symbol="AMD" />
      </div>,
    );
    await userEvent.click(screen.getByRole("link", { name: "Open AMD chart on Barchart" }));
    expect(onRowClick).not.toHaveBeenCalled();
  });

  it("renders nothing for an empty symbol", () => {
    const { container } = render(<SymbolLink symbol="" />);
    expect(container.innerHTML).toBe("");
  });
});
