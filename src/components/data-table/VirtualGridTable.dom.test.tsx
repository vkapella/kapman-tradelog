// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createRef } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { VirtualGridBody } from "@/components/data-table/VirtualGridTable";

function mockMatchMedia(matches: boolean) {
  vi.stubGlobal(
    "matchMedia",
    vi.fn().mockImplementation((query: string) => ({
      matches,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  );
  window.matchMedia = globalThis.matchMedia as typeof window.matchMedia;
}

describe("VirtualGridBody row-click convenience", () => {
  beforeEach(() => mockMatchMedia(true));
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  function renderRows(onRowClick: (row: { id: string }) => void) {
    const scrollContainerRef = createRef<HTMLDivElement>();
    return render(
      <div ref={scrollContainerRef}>
        <VirtualGridBody
          rows={[{ id: "row-1" }]}
          columnTemplate="1fr 1fr"
          scrollContainerRef={scrollContainerRef}
          getRowKey={(row) => row.id}
          onRowClick={onRowClick}
          renderRow={(row) => (
            <>
              <div>{row.id}</div>
              <div>
                <a href="/drill">drill-through</a>
                <button type="button">inner action</button>
              </div>
            </>
          )}
        />
      </div>,
    );
  }

  it("opens on plain row click below md", async () => {
    const user = userEvent.setup();
    const onRowClick = vi.fn();
    renderRows(onRowClick);
    await user.click(screen.getByText("row-1"));
    expect(onRowClick).toHaveBeenCalledWith({ id: "row-1" });
  });

  it("ignores clicks on child interactive controls — drill-throughs keep working", async () => {
    const user = userEvent.setup();
    const onRowClick = vi.fn();
    renderRows(onRowClick);
    await user.click(screen.getByText("inner action"));
    await user.click(screen.getByText("drill-through"));
    expect(onRowClick).not.toHaveBeenCalled();
  });

  it("does nothing at md+ (Details button is the activation path; row click is phone convenience)", async () => {
    mockMatchMedia(false);
    const user = userEvent.setup();
    const onRowClick = vi.fn();
    renderRows(onRowClick);
    await user.click(screen.getByText("row-1"));
    expect(onRowClick).not.toHaveBeenCalled();
  });

  it("keeps row semantics — no role=button on rows", () => {
    renderRows(vi.fn());
    const row = document.querySelector("[data-virtual-grid-row]") as HTMLElement;
    expect(row.getAttribute("role")).toBe("row");
  });
});
