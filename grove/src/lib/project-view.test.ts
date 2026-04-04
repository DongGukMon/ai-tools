import { describe, expect, it } from "vitest";
import type { Project } from "../types";
import {
  applyOrgProjectOrder,
  getProjectDisplayName,
  groupProjectsByOrg,
} from "./project-view";

function makeProject(id: string, org: string, repo: string): Project {
  return {
    id,
    name: repo,
    url: `https://github.com/${org}/${repo}.git`,
    org,
    repo,
    sourcePath: `/tmp/${org}/${repo}`,
    worktrees: [],
    sourceHasChanges: false,
    sourceBehindRemote: false,
    baseBranch: null,
    resolvedDefaultBranch: "main",
    collapsed: false,
  };
}

describe("groupProjectsByOrg", () => {
  it("preserves first-seen org order and project order within each org", () => {
    const projects = [
      makeProject("p1", "sendbird", "desk"),
      makeProject("p2", "bang9", "grove"),
      makeProject("p3", "sendbird", "calls"),
      makeProject("p4", "bang9", "ai-tools"),
    ];

    expect(groupProjectsByOrg(projects)).toEqual([
      {
        org: "sendbird",
        projects: [projects[0], projects[2]],
      },
      {
        org: "bang9",
        projects: [projects[1], projects[3]],
      },
    ]);
  });
});

describe("getProjectDisplayName", () => {
  it("omits the org prefix when grouped mode already provides that context", () => {
    expect(
      getProjectDisplayName(makeProject("p1", "sendbird", "desk"), {
        showOrgPrefix: false,
      }),
    ).toBe("desk");
  });

  it("keeps custom project names regardless of org prefix mode", () => {
    expect(
      getProjectDisplayName(
        {
          ...makeProject("p1", "sendbird", "desk"),
          name: "Core Desk",
        },
        { showOrgPrefix: false },
      ),
    ).toBe("Core Desk");
  });
});

describe("applyOrgProjectOrder", () => {
  it("reorders only the targeted org while preserving other org slots", () => {
    const projects = [
      makeProject("p1", "sendbird", "desk"),
      makeProject("p2", "bang9", "grove"),
      makeProject("p3", "sendbird", "calls"),
      makeProject("p4", "bang9", "ai-tools"),
    ];

    expect(applyOrgProjectOrder(projects, "sendbird", ["p3", "p1"])).toEqual([
      "p3",
      "p2",
      "p1",
      "p4",
    ]);
  });

  it("returns the existing order when the provided org ids are invalid", () => {
    const projects = [
      makeProject("p1", "sendbird", "desk"),
      makeProject("p2", "bang9", "grove"),
    ];

    expect(applyOrgProjectOrder(projects, "sendbird", ["missing"])).toEqual(["p1", "p2"]);
  });
});
