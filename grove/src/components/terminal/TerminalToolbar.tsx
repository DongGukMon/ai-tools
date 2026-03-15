import { useTerminal } from "../../hooks/useTerminal";

export default function TerminalToolbar() {
  const { splitCurrent, closeCurrent, focusedPtyId } = useTerminal();

  return (
    <div className="terminal-toolbar">
      <div className="terminal-toolbar-actions">
        <button
          className="terminal-toolbar-btn"
          onClick={() => splitCurrent("horizontal")}
          disabled={!focusedPtyId}
          title="Split Horizontal"
        >
          &#x2502;&#x2502;
        </button>
        <button
          className="terminal-toolbar-btn"
          onClick={() => splitCurrent("vertical")}
          disabled={!focusedPtyId}
          title="Split Vertical"
        >
          &#x2500;&#x2500;
        </button>
        <button
          className="terminal-toolbar-btn terminal-toolbar-btn-close"
          onClick={closeCurrent}
          disabled={!focusedPtyId}
          title="Close Terminal"
        >
          &#x2715;
        </button>
      </div>
    </div>
  );
}
