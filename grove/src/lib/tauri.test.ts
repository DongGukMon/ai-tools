import { describe, expect, it } from "vitest";
import { getCommandErrorMessage } from "./tauri";

describe("getCommandErrorMessage", () => {
  it("redacts local clone paths and credentials", () => {
    const message = getCommandErrorMessage(
      "Error: git clone failed: Cloning into '/Users/test/.grove/github.com/bang9/repo/source'...\nhttps://token@github.com: Permission denied",
    );

    expect(message).toContain("Cloning repository...");
    expect(message).toContain("https://***@github.com");
    expect(message).not.toContain("/Users/test/.grove");
    expect(message).not.toContain("token@");
  });

  it("redacts standalone filesystem paths", () => {
    const message = getCommandErrorMessage(
      "Failed to open repo at /private/tmp/grove-dev/grove/source",
    );

    expect(message).toContain("[path]");
    expect(message).not.toContain("/private/tmp/grove-dev");
  });
});
