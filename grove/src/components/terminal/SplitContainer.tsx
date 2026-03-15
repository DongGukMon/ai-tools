import { Allotment } from "allotment";
import type { SplitNode } from "../../types";
import TerminalInstance from "./TerminalInstance";

interface Props {
  node: SplitNode;
}

function getNodeKey(node: SplitNode): string {
  if (node.type === "leaf") return node.ptyId ?? "empty";
  return (node.children ?? []).map(getNodeKey).join("-");
}

export default function SplitContainer({ node }: Props) {
  if (node.type === "leaf") {
    return node.ptyId ? <TerminalInstance ptyId={node.ptyId} /> : null;
  }

  return (
    <Allotment vertical={node.type === "vertical"}>
      {node.children?.map((child) => (
        <Allotment.Pane key={getNodeKey(child)}>
          <SplitContainer node={child} />
        </Allotment.Pane>
      ))}
    </Allotment>
  );
}
