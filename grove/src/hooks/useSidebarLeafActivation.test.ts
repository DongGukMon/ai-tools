import { describe, expect, it, vi } from "vitest";
import { runSidebarLeafActivation } from "./useSidebarLeafActivation";

describe("runSidebarLeafActivation", () => {
  it("selects when the row is not selected", () => {
    const onSelect = vi.fn();
    const onReselect = vi.fn();

    runSidebarLeafActivation({
      isSelected: false,
      onSelect,
      onReselect,
    });

    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onReselect).not.toHaveBeenCalled();
  });

  it("reselects when the row is already selected", () => {
    const onSelect = vi.fn();
    const onReselect = vi.fn();

    runSidebarLeafActivation({
      isSelected: true,
      onSelect,
      onReselect,
    });

    expect(onSelect).not.toHaveBeenCalled();
    expect(onReselect).toHaveBeenCalledTimes(1);
  });

  it("does nothing when the row is disabled", () => {
    const onSelect = vi.fn();
    const onReselect = vi.fn();

    runSidebarLeafActivation({
      disabled: true,
      isSelected: true,
      onSelect,
      onReselect,
    });

    expect(onSelect).not.toHaveBeenCalled();
    expect(onReselect).not.toHaveBeenCalled();
  });
});
