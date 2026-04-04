import { describe, expect, it } from "vitest";
import { isPrimaryMouseButton } from "./useMarqueeSelection";

describe("isPrimaryMouseButton", () => {
  it("accepts left-click for marquee selection", () => {
    expect(isPrimaryMouseButton(0)).toBe(true);
  });

  it("ignores right-click so context menus can open", () => {
    expect(isPrimaryMouseButton(2)).toBe(false);
  });

  it("ignores middle-click as a non-selection gesture", () => {
    expect(isPrimaryMouseButton(1)).toBe(false);
  });
});
