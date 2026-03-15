import { describe, it, expect } from "vitest";
import type { SplitNode } from "../types";
import {
  toLayoutTemplate,
  countLeaves,
  assignPtyIds,
  splitNode,
  removeNode,
  findFirstLeaf,
  setSizesAtPath,
} from "./split-tree";

// ── Helpers ──

const leaf = (ptyId?: string): SplitNode => ({ type: "leaf", ptyId });

const hSplit = (children: SplitNode[], sizes?: number[]): SplitNode => ({
  type: "horizontal",
  children,
  sizes,
});

const vSplit = (children: SplitNode[], sizes?: number[]): SplitNode => ({
  type: "vertical",
  children,
  sizes,
});

// ── toLayoutTemplate ──

describe("toLayoutTemplate", () => {
  it("strips ptyId from a single leaf", () => {
    const result = toLayoutTemplate(leaf("pty-1"));
    expect(result).toEqual({ type: "leaf" });
    expect(result.ptyId).toBeUndefined();
  });

  it("returns bare leaf for leaf without ptyId", () => {
    expect(toLayoutTemplate(leaf())).toEqual({ type: "leaf" });
  });

  it("preserves structure and sizes in a horizontal split", () => {
    const tree = hSplit([leaf("a"), leaf("b")], [40, 60]);
    const result = toLayoutTemplate(tree);
    expect(result).toEqual({
      type: "horizontal",
      sizes: [40, 60],
      children: [{ type: "leaf" }, { type: "leaf" }],
    });
  });

  it("strips ptyIds from deeply nested tree", () => {
    const tree = vSplit([
      leaf("a"),
      hSplit([leaf("b"), leaf("c")], [30, 70]),
    ]);
    const result = toLayoutTemplate(tree);
    expect(result).toEqual({
      type: "vertical",
      sizes: undefined,
      children: [
        { type: "leaf" },
        {
          type: "horizontal",
          sizes: [30, 70],
          children: [{ type: "leaf" }, { type: "leaf" }],
        },
      ],
    });
  });
});

// ── countLeaves ──

describe("countLeaves", () => {
  it("counts a single leaf as 1", () => {
    expect(countLeaves(leaf("x"))).toBe(1);
  });

  it("counts two children in a flat split", () => {
    expect(countLeaves(hSplit([leaf("a"), leaf("b")]))).toBe(2);
  });

  it("counts leaves in a nested tree", () => {
    const tree = vSplit([
      leaf("a"),
      hSplit([leaf("b"), leaf("c"), leaf("d")]),
    ]);
    expect(countLeaves(tree)).toBe(4);
  });

  it("counts a deeply nested single-leaf branch as 1", () => {
    // A degenerate tree: split with one child that is a split with one child
    const tree: SplitNode = {
      type: "horizontal",
      children: [{ type: "vertical", children: [leaf("only")] }],
    };
    expect(countLeaves(tree)).toBe(1);
  });

  it("returns 0 for a branch with no children", () => {
    const tree: SplitNode = { type: "horizontal", children: [] };
    expect(countLeaves(tree)).toBe(0);
  });
});

// ── assignPtyIds ──

describe("assignPtyIds", () => {
  it("assigns a single id to a single leaf", () => {
    const ids = ["pty-1"];
    const result = assignPtyIds(leaf(), ids);
    expect(result).toEqual({ type: "leaf", ptyId: "pty-1" });
    expect(ids).toEqual([]); // consumed
  });

  it("assigns ids to leaves in left-to-right order", () => {
    const template = hSplit([leaf(), leaf()]);
    const ids = ["a", "b"];
    const result = assignPtyIds(template, ids);
    expect(result.children![0].ptyId).toBe("a");
    expect(result.children![1].ptyId).toBe("b");
  });

  it("assigns ids through nested structure", () => {
    const template = vSplit([leaf(), hSplit([leaf(), leaf()])]);
    const ids = ["x", "y", "z"];
    const result = assignPtyIds(template, ids);
    expect(result.children![0].ptyId).toBe("x");
    expect(result.children![1].children![0].ptyId).toBe("y");
    expect(result.children![1].children![1].ptyId).toBe("z");
    expect(ids).toEqual([]);
  });

  it("preserves saved sizes on nested branches", () => {
    const template = vSplit(
      [leaf(), hSplit([leaf(), leaf()], [0.8, 0.2])],
      [0.322, 0.678],
    );
    const ids = ["x", "y", "z"];
    const result = assignPtyIds(template, ids);
    expect(result.sizes).toEqual([0.322, 0.678]);
    expect(result.children![1].sizes).toEqual([0.8, 0.2]);
  });

  it("assigns undefined when ids array is exhausted", () => {
    const template = hSplit([leaf(), leaf()]);
    const ids = ["only-one"];
    const result = assignPtyIds(template, ids);
    expect(result.children![0].ptyId).toBe("only-one");
    expect(result.children![1].ptyId).toBeUndefined();
  });
});

// ── splitNode ──

describe("splitNode", () => {
  it("splits a single leaf horizontally", () => {
    const result = splitNode(leaf("a"), "a", "horizontal", "b");
    expect(result).toEqual({
      type: "horizontal",
      children: [leaf("a"), leaf("b")],
    });
  });

  it("splits a single leaf vertically", () => {
    const result = splitNode(leaf("a"), "a", "vertical", "b");
    expect(result).toEqual({
      type: "vertical",
      children: [leaf("a"), leaf("b")],
    });
  });

  it("splits a leaf inside a nested tree", () => {
    const tree = hSplit([leaf("a"), leaf("b")]);
    const result = splitNode(tree, "b", "vertical", "c");
    expect(result).toEqual(
      hSplit([leaf("a"), vSplit([leaf("b"), leaf("c")])]),
    );
  });

  it("returns the same reference if target not found", () => {
    const tree = hSplit([leaf("a"), leaf("b")]);
    const result = splitNode(tree, "nonexistent", "horizontal", "c");
    expect(result).toBe(tree);
  });

  it("splits deeply nested leaf", () => {
    const tree = vSplit([leaf("a"), hSplit([leaf("b"), leaf("c")])]);
    const result = splitNode(tree, "c", "horizontal", "d");
    expect(result.children![1].children![1]).toEqual(
      hSplit([leaf("c"), leaf("d")]),
    );
    // The untouched left branch should be the same reference
    expect(result.children![0]).toBe(tree.children![0]);
  });

  it("preserves sizes on parent after split", () => {
    const tree = hSplit([leaf("a"), leaf("b")], [50, 50]);
    const result = splitNode(tree, "a", "vertical", "c");
    expect(result.sizes).toEqual([50, 50]);
    expect(result.children![0]).toEqual(vSplit([leaf("a"), leaf("c")]));
  });
});

// ── removeNode ──

describe("removeNode", () => {
  it("returns null when removing the only leaf", () => {
    expect(removeNode(leaf("a"), "a")).toBeNull();
  });

  it("keeps a leaf that does not match", () => {
    const node = leaf("a");
    expect(removeNode(node, "b")).toBe(node);
  });

  it("removes one child from a two-child split, collapsing parent", () => {
    const tree = hSplit([leaf("a"), leaf("b")]);
    const result = removeNode(tree, "a");
    // Single remaining child collapses: returns leaf("b") directly
    expect(result).toEqual(leaf("b"));
  });

  it("removes one child from a three-child split without collapsing", () => {
    const tree = hSplit([leaf("a"), leaf("b"), leaf("c")]);
    const result = removeNode(tree, "b");
    expect(result).toEqual(hSplit([leaf("a"), leaf("c")]));
  });

  it("collapses single-child parent after nested removal", () => {
    // h[ v[ a, b ], c ] -> remove b -> v collapses to a -> h[ a, c ]
    const tree = hSplit([vSplit([leaf("a"), leaf("b")]), leaf("c")]);
    const result = removeNode(tree, "b");
    expect(result).toEqual(hSplit([leaf("a"), leaf("c")]));
  });

  it("returns null when all leaves are removed", () => {
    // All children produce null -> parent returns null
    const tree = hSplit([leaf("a")]);
    expect(removeNode(tree, "a")).toBeNull();
  });

  it("returns node unchanged for branch with no children field", () => {
    const node: SplitNode = { type: "horizontal" };
    expect(removeNode(node, "a")).toBe(node);
  });

  it("handles deep removal preserving unrelated branches", () => {
    const tree = hSplit([
      vSplit([leaf("a"), leaf("b")]),
      vSplit([leaf("c"), leaf("d")]),
    ]);
    const result = removeNode(tree, "c");
    expect(result).toEqual(
      hSplit([vSplit([leaf("a"), leaf("b")]), leaf("d")]),
    );
  });
});

// ── findFirstLeaf ──

describe("findFirstLeaf", () => {
  it("returns ptyId of a single leaf", () => {
    expect(findFirstLeaf(leaf("x"))).toBe("x");
  });

  it("returns null for a leaf without ptyId", () => {
    expect(findFirstLeaf(leaf())).toBeNull();
  });

  it("finds the leftmost leaf in a flat split", () => {
    expect(findFirstLeaf(hSplit([leaf("a"), leaf("b")]))).toBe("a");
  });

  it("finds the deepest-left leaf in a nested tree", () => {
    const tree = vSplit([
      hSplit([leaf("deep-left"), leaf("x")]),
      leaf("y"),
    ]);
    expect(findFirstLeaf(tree)).toBe("deep-left");
  });

  it("skips leaves without ptyId to find first with ptyId", () => {
    const tree = hSplit([leaf(), leaf("found")]);
    expect(findFirstLeaf(tree)).toBe("found");
  });

  it("returns null when no leaf has a ptyId", () => {
    const tree = hSplit([leaf(), leaf()]);
    expect(findFirstLeaf(tree)).toBeNull();
  });
});

// ── setSizesAtPath ──

describe("setSizesAtPath", () => {
  it("sets sizes at root (empty path)", () => {
    const tree = hSplit([leaf("a"), leaf("b")]);
    const result = setSizesAtPath(tree, [], [30, 70]);
    expect(result.sizes).toEqual([30, 70]);
    expect(result.children).toBe(tree.children); // same reference
  });

  it("sets sizes at a nested child path", () => {
    const inner = hSplit([leaf("a"), leaf("b")]);
    const tree = vSplit([inner, leaf("c")]);
    const result = setSizesAtPath(tree, [0], [25, 75]);
    expect(result.children![0].sizes).toEqual([25, 75]);
    // Sibling untouched
    expect(result.children![1]).toBe(tree.children![1]);
  });

  it("sets sizes two levels deep", () => {
    const deepInner = vSplit([leaf("x"), leaf("y")]);
    const tree = hSplit([vSplit([deepInner, leaf("z")]), leaf("w")]);
    const result = setSizesAtPath(tree, [0, 0], [10, 90]);
    expect(result.children![0].children![0].sizes).toEqual([10, 90]);
  });

  it("returns node unchanged if path hits a leaf (no children)", () => {
    const tree = hSplit([leaf("a"), leaf("b")]);
    // Path [0, 0] tries to descend into leaf("a") which has no children
    const result = setSizesAtPath(tree, [0, 0], [50, 50]);
    expect(result.children![0]).toBe(tree.children![0]);
  });

  it("preserves other branches when setting sizes", () => {
    const tree = hSplit([
      vSplit([leaf("a"), leaf("b")], [60, 40]),
      vSplit([leaf("c"), leaf("d")], [50, 50]),
    ]);
    const result = setSizesAtPath(tree, [0], [20, 80]);
    expect(result.children![0].sizes).toEqual([20, 80]);
    // Right branch entirely unchanged
    expect(result.children![1]).toBe(tree.children![1]);
    expect(result.children![1].sizes).toEqual([50, 50]);
  });

  it("replaces existing sizes at root", () => {
    const tree = hSplit([leaf("a"), leaf("b")], [40, 60]);
    const result = setSizesAtPath(tree, [], [55, 45]);
    expect(result.sizes).toEqual([55, 45]);
  });
});
