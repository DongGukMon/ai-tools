package parser

import "time"

// TimelineEvent represents a single normalized event in the session timeline.
type TimelineEvent struct {
	Timestamp  time.Time `json:"timestamp"`
	Type       string    `json:"type"`                 // "user", "assistant", "tool_call", "tool_result", "thinking", "system"
	Role       string    `json:"role"`                 // "user", "assistant", "system"
	Summary    string    `json:"summary"`              // One-line summary for card display
	Content    string    `json:"content"`              // Full content for expanded view
	ToolName   string    `json:"toolName,omitempty"`   // Tool name (for tool_call/tool_result)
	ToolInput  string    `json:"toolInput,omitempty"`  // Tool input JSON (for tool_call)
	ToolResult string    `json:"toolResult,omitempty"` // Tool result (for tool_result)
}

// Session holds the full parsed session data.
type Session struct {
	ID        string          `json:"id"`
	Backend   string          `json:"backend"`
	Model     string          `json:"model,omitempty"`
	CWD       string          `json:"cwd,omitempty"`
	StartedAt time.Time       `json:"startedAt"`
	Events    []TimelineEvent `json:"events"`
}

// truncate returns s truncated to maxLen characters with "..." appended if needed.
func truncate(s string, maxLen int) string {
	runes := []rune(s)
	if len(runes) <= maxLen {
		return s
	}
	return string(runes[:maxLen]) + "..."
}
