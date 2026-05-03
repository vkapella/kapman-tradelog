import React from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { RangeFilterContext, RangeFilterProvider } from "./RangeFilterContext";

function ContextReader() {
  return (
    <RangeFilterContext.Consumer>
      {(value) => <span>{value.displayText}</span>}
    </RangeFilterContext.Consumer>
  );
}

describe("RangeFilterProvider", () => {
  it("mounts and provides default all-time label", () => {
    const html = renderToString(
      <RangeFilterProvider>
        <ContextReader />
      </RangeFilterProvider>,
    );

    expect(html).toContain("All Time");
  });
});
