import { describe, expect, it } from "vitest";
import { shouldDetachTerminalContainer } from "./terminal-runtime";

describe("shouldDetachTerminalContainer", () => {
  it("allows unconditional detach when no owner container is provided", () => {
    expect(shouldDetachTerminalContainer({} as HTMLDivElement)).toBe(true);
  });

  it("allows detach when the runtime is still attached to the owner's container", () => {
    const container = {} as HTMLDivElement;

    expect(shouldDetachTerminalContainer(container, container)).toBe(true);
  });

  it("blocks stale cleanup from detaching a runtime reattached elsewhere", () => {
    const previousContainer = {} as HTMLDivElement;
    const nextContainer = {} as HTMLDivElement;

    expect(shouldDetachTerminalContainer(nextContainer, previousContainer)).toBe(false);
  });
});
