import { describe, expect, it, vi } from "vitest";
import { handleRemoveWidgetClick, stopDashboardControlPropagation } from "./interactions";

describe("dashboard widget remove interactions", () => {
  it("removes widget on click when in edit mode", () => {
    const stopPropagation = vi.fn();
    const remove = vi.fn();

    handleRemoveWidgetClick({ stopPropagation }, { editMode: true, remove });

    expect(stopPropagation).toHaveBeenCalledTimes(1);
    expect(remove).toHaveBeenCalledTimes(1);
  });

  it("does not remove widget on click when not in edit mode", () => {
    const stopPropagation = vi.fn();
    const remove = vi.fn();

    handleRemoveWidgetClick({ stopPropagation }, { editMode: false, remove });

    expect(stopPropagation).toHaveBeenCalledTimes(1);
    expect(remove).not.toHaveBeenCalled();
  });

  it("stops propagation on pointer down for remove button fallback", () => {
    const stopPropagation = vi.fn();

    stopDashboardControlPropagation({ stopPropagation });

    expect(stopPropagation).toHaveBeenCalledTimes(1);
  });
});
