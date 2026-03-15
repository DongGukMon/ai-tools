import type { SplitNode } from "../types";

/** Strip ptyIds from a SplitNode tree, keeping structure + sizes. */
export function toLayoutTemplate(node: SplitNode): SplitNode {
  if (node.type === "leaf") return { type: "leaf" };
  return {
    type: node.type,
    sizes: node.sizes,
    children: node.children?.map(toLayoutTemplate),
  };
}

/** Count leaf nodes in a layout. */
export function countLeaves(node: SplitNode): number {
  if (node.type === "leaf") return 1;
  return (node.children ?? []).reduce((sum, c) => sum + countLeaves(c), 0);
}

/** Assign ptyIds from an array into a layout template's leaf nodes. */
export function assignPtyIds(node: SplitNode, ids: string[]): SplitNode {
  if (node.type === "leaf") {
    return { type: "leaf", ptyId: ids.shift() };
  }
  return {
    type: node.type,
    sizes: node.sizes,
    children: node.children?.map((c) => assignPtyIds(c, ids)),
  };
}

export function splitNode(
  node: SplitNode,
  targetPtyId: string,
  direction: "horizontal" | "vertical",
  newPtyId: string,
): SplitNode {
  if (node.type === "leaf" && node.ptyId === targetPtyId) {
    return {
      type: direction,
      children: [
        { type: "leaf", ptyId: targetPtyId },
        { type: "leaf", ptyId: newPtyId },
      ],
    };
  }
  if (node.children) {
    const newChildren = node.children.map((child) =>
      splitNode(child, targetPtyId, direction, newPtyId),
    );
    if (newChildren.some((c, i) => c !== node.children![i])) {
      return { ...node, children: newChildren };
    }
  }
  return node;
}

export function removeNode(node: SplitNode, targetPtyId: string): SplitNode | null {
  if (node.type === "leaf") {
    return node.ptyId === targetPtyId ? null : node;
  }
  if (!node.children) return node;

  const filtered = node.children
    .map((child) => removeNode(child, targetPtyId))
    .filter((child): child is SplitNode => child !== null);

  if (filtered.length === 0) return null;
  if (filtered.length === 1) return filtered[0];
  return { ...node, children: filtered };
}

/** Set sizes at a specific path in the tree. nodePath = [childIndex, childIndex, ...] */
export function setSizesAtPath(node: SplitNode, path: number[], sizes: number[]): SplitNode {
  if (path.length === 0) {
    return { ...node, sizes };
  }
  if (!node.children) return node;
  const [head, ...rest] = path;
  const newChildren = node.children.map((child, i) =>
    i === head ? setSizesAtPath(child, rest, sizes) : child,
  );
  return { ...node, children: newChildren };
}

export function findFirstLeaf(node: SplitNode): string | null {
  if (node.type === "leaf") return node.ptyId ?? null;
  if (node.children) {
    for (const child of node.children) {
      const id = findFirstLeaf(child);
      if (id) return id;
    }
  }
  return null;
}
