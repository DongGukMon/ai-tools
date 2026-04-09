import { describe, expect, it } from "vitest";
import { getGitHubRepoUrl } from "./project-remote";

describe("getGitHubRepoUrl", () => {
  it("returns a browser URL for https GitHub remotes", () => {
    expect(getGitHubRepoUrl("https://github.com/bang9/grove.git")).toBe(
      "https://github.com/bang9/grove",
    );
  });

  it("drops credentials from GitHub remotes", () => {
    expect(getGitHubRepoUrl("https://token@github.com/bang9/grove.git")).toBe(
      "https://github.com/bang9/grove",
    );
  });

  it("returns a browser URL for SSH GitHub remotes", () => {
    expect(getGitHubRepoUrl("git@github.sendbird.com:product/grove.git")).toBe(
      "https://github.sendbird.com/product/grove",
    );
  });

  it("returns null for non-GitHub remotes", () => {
    expect(getGitHubRepoUrl("https://gitlab.com/bang9/grove.git")).toBeNull();
  });
});
