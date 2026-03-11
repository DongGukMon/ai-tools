package parser

import (
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestParseClaudeStructuredContent(t *testing.T) {
	path := writeTestFile(t, "claude.jsonl", ""+
		"{\"type\":\"user\",\"timestamp\":\"2026-03-11T12:00:00Z\",\"sessionId\":\"claude-session\",\"cwd\":\"/tmp/project\",\"message\":{\"content\":[{\"type\":\"text\",\"text\":\"hello world\\nnext line\"}]}}\n"+
		"{\"type\":\"assistant\",\"timestamp\":\"2026-03-11T12:00:01Z\",\"message\":{\"model\":\"claude-sonnet-4\",\"content\":[{\"type\":\"thinking\",\"thinking\":\"thinking trace\"},{\"type\":\"tool_use\",\"name\":\"exec\",\"input\":{\"cmd\":\"pwd\"}},{\"type\":\"text\",\"text\":\"done\"}]}}\n"+
		"{\"type\":\"user\",\"timestamp\":\"2026-03-11T12:00:02Z\",\"toolUseResult\":{\"file\":{\"content\":\"full file output\"}},\"message\":{\"content\":[{\"type\":\"tool_result\",\"content\":\"short result\"}]}}\n",
	)

	session, err := ParseClaude(path)
	if err != nil {
		t.Fatalf("ParseClaude returned error: %v", err)
	}

	if session.ID != "claude-session" {
		t.Fatalf("expected session id, got %q", session.ID)
	}
	if session.CWD != "/tmp/project" {
		t.Fatalf("expected cwd, got %q", session.CWD)
	}
	if session.Model != "claude-sonnet-4" {
		t.Fatalf("expected model, got %q", session.Model)
	}
	if len(session.Events) != 5 {
		t.Fatalf("expected 5 events, got %d", len(session.Events))
	}
	if session.Events[1].Type != "thinking" || session.Events[1].Timestamp.IsZero() {
		t.Fatalf("expected thinking event with timestamp, got %+v", session.Events[1])
	}
	if session.Events[2].Type != "tool_call" || session.Events[2].ToolInput != "{\"cmd\":\"pwd\"}" {
		t.Fatalf("expected tool call input to be preserved, got %+v", session.Events[2])
	}
	if session.Events[4].ToolResult != "full file output" {
		t.Fatalf("expected file-backed tool result, got %q", session.Events[4].ToolResult)
	}
}

func TestParseCodexPopulatesTimestamps(t *testing.T) {
	path := writeTestFile(t, "codex.jsonl", ""+
		"{\"id\":\"codex-session\",\"timestamp\":\"2026-03-11T13:00:00Z\"}\n"+
		"{\"type\":\"message\",\"timestamp\":\"2026-03-11T13:00:01Z\",\"role\":\"user\",\"content\":[{\"type\":\"input_text\",\"text\":\"question\"}]}\n"+
		"{\"type\":\"reasoning\",\"timestamp\":\"2026-03-11T13:00:02Z\",\"summary\":[{\"type\":\"summary_text\",\"text\":\"thinking\"}]}\n"+
		"{\"type\":\"message\",\"timestamp\":\"2026-03-11T13:00:03Z\",\"role\":\"assistant\",\"content\":[{\"type\":\"tool_call\",\"name\":\"search\",\"arguments\":{\"q\":\"rewind\"}},{\"type\":\"tool_result\",\"output\":\"ok\"},{\"type\":\"output_text\",\"text\":\"answer\"}]}\n",
	)

	session, err := ParseCodex(path)
	if err != nil {
		t.Fatalf("ParseCodex returned error: %v", err)
	}

	if session.ID != "codex-session" {
		t.Fatalf("expected session id, got %q", session.ID)
	}
	if len(session.Events) != 5 {
		t.Fatalf("expected 5 events, got %d", len(session.Events))
	}
	for i, event := range session.Events {
		if event.Timestamp.IsZero() {
			t.Fatalf("event %d missing timestamp: %+v", i, event)
		}
	}
	if !session.StartedAt.Equal(time.Date(2026, 3, 11, 13, 0, 1, 0, time.UTC)) {
		t.Fatalf("expected startedAt to match first event timestamp, got %s", session.StartedAt)
	}
	if session.Events[2].ToolInput != "{\"q\":\"rewind\"}" {
		t.Fatalf("expected tool input to be preserved, got %q", session.Events[2].ToolInput)
	}
}

func writeTestFile(t *testing.T, name, content string) string {
	t.Helper()
	path := filepath.Join(t.TempDir(), name)
	if err := os.WriteFile(path, []byte(content), 0o644); err != nil {
		t.Fatalf("failed to write test file: %v", err)
	}
	return path
}
