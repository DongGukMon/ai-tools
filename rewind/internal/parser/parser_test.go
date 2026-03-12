package parser

import (
	"os"
	"path/filepath"
	"strings"
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

func TestParseClaudeSupportsStringToolUseResult(t *testing.T) {
	path := writeTestFile(t, "claude-string-tool-result.jsonl", ""+
		"{\"type\":\"user\",\"timestamp\":\"2026-03-11T12:00:00Z\",\"toolUseResult\":\"Error: Exit code 1\",\"message\":{\"content\":[{\"type\":\"tool_result\",\"content\":\"\"}]}}\n",
	)

	session, err := ParseClaude(path)
	if err != nil {
		t.Fatalf("ParseClaude returned error: %v", err)
	}

	if len(session.Events) != 1 {
		t.Fatalf("expected 1 event, got %d", len(session.Events))
	}
	if session.Events[0].ToolResult != "Error: Exit code 1" {
		t.Fatalf("expected string-backed tool result, got %+v", session.Events[0])
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

func TestParseCodexSupportsCustomToolResponseItems(t *testing.T) {
	path := writeTestFile(t, "codex-custom-tools.jsonl", ""+
		"{\"type\":\"session_meta\",\"payload\":{\"id\":\"codex-session\",\"timestamp\":\"2026-03-11T13:00:00Z\"}}\n"+
		"{\"type\":\"response_item\",\"timestamp\":\"2026-03-11T13:00:01Z\",\"payload\":{\"type\":\"custom_tool_call\",\"name\":\"apply_patch\",\"input\":\"*** Begin Patch\\n*** End Patch\\n\"}}\n"+
		"{\"type\":\"response_item\",\"timestamp\":\"2026-03-11T13:00:02Z\",\"payload\":{\"type\":\"custom_tool_call_output\",\"output\":\"Success\"}}\n",
	)

	session, err := ParseCodex(path)
	if err != nil {
		t.Fatalf("ParseCodex returned error: %v", err)
	}

	if len(session.Events) != 2 {
		t.Fatalf("expected 2 events, got %d", len(session.Events))
	}
	if session.Events[0].Type != "tool_call" || session.Events[0].ToolName != "apply_patch" {
		t.Fatalf("expected custom tool call event, got %+v", session.Events[0])
	}
	if session.Events[1].Type != "tool_result" || session.Events[1].ToolResult != "Success" {
		t.Fatalf("expected custom tool result event, got %+v", session.Events[1])
	}
}

func TestParseCodexSupportsWebSearchCallResponseItem(t *testing.T) {
	path := writeTestFile(t, "codex-web-search.jsonl", ""+
		"{\"type\":\"session_meta\",\"payload\":{\"id\":\"codex-session\",\"timestamp\":\"2026-03-11T13:00:00Z\"}}\n"+
		"{\"type\":\"response_item\",\"timestamp\":\"2026-03-11T13:00:01Z\",\"payload\":{\"type\":\"web_search_call\",\"action\":{\"type\":\"search\",\"query\":\"site:example.com rewind\"}}}\n",
	)

	session, err := ParseCodex(path)
	if err != nil {
		t.Fatalf("ParseCodex returned error: %v", err)
	}

	if len(session.Events) != 1 {
		t.Fatalf("expected 1 event, got %d", len(session.Events))
	}
	if session.Events[0].Type != "tool_call" || session.Events[0].ToolName != "web_search" {
		t.Fatalf("expected web search tool call event, got %+v", session.Events[0])
	}
	if !strings.Contains(session.Events[0].ToolInput, "\"query\":\"site:example.com rewind\"") {
		t.Fatalf("expected serialized web search action, got %+v", session.Events[0])
	}
}

func TestParseClaudeRejectsMalformedJSONLBeforeViewerExport(t *testing.T) {
	path := writeTestFile(t, "claude-invalid.jsonl", ""+
		"{\"type\":\"user\",\"timestamp\":\"2026-03-11T12:00:00Z\",\"message\":{\"content\":\"ok\"}}\n"+
		"{\"type\":\"assistant\",\"timestamp\":\"2026-03-11T12:00:01Z\",not-json}\n",
	)

	_, err := ParseClaude(path)
	if err == nil {
		t.Fatal("expected malformed Claude JSONL to fail")
	}
	if !strings.Contains(err.Error(), "line 2") {
		t.Fatalf("expected line number in error, got %v", err)
	}
}

func TestParseClaudeRejectsUnsupportedMessageContent(t *testing.T) {
	path := writeTestFile(t, "claude-invalid-content.jsonl", ""+
		"{\"type\":\"user\",\"timestamp\":\"2026-03-11T12:00:00Z\",\"message\":{\"content\":{}}}\n",
	)

	_, err := ParseClaude(path)
	if err == nil {
		t.Fatal("expected unsupported Claude message content to fail")
	}
	if !strings.Contains(err.Error(), "unsupported message content format") {
		t.Fatalf("expected unsupported content error, got %v", err)
	}
}

func TestParseClaudeAllowsStringToolUseResult(t *testing.T) {
	path := writeTestFile(t, "claude-string-tool-result.jsonl", ""+
		"{\"type\":\"user\",\"timestamp\":\"2026-03-11T12:00:00Z\",\"message\":{\"content\":[{\"type\":\"tool_result\",\"content\":\"tool output\"}]},\"toolUseResult\":\"User rejected tool use\"}\n",
	)

	session, err := ParseClaude(path)
	if err != nil {
		t.Fatalf("ParseClaude returned error: %v", err)
	}
	if len(session.Events) != 1 || session.Events[0].ToolResult != "tool output" {
		t.Fatalf("expected tool result event, got %+v", session.Events)
	}
}

func TestParseClaudeAllowsNoOutputToolResults(t *testing.T) {
	path := writeTestFile(t, "claude-no-output-tool-result.jsonl", ""+
		"{\"type\":\"user\",\"timestamp\":\"2026-03-11T12:00:00Z\",\"message\":{\"content\":[{\"type\":\"tool_result\",\"content\":\"\"}]},\"toolUseResult\":{\"stdout\":\"\",\"stderr\":\"\",\"noOutputExpected\":true}}\n"+
		"{\"type\":\"assistant\",\"timestamp\":\"2026-03-11T12:00:01Z\",\"message\":{\"content\":[{\"type\":\"text\",\"text\":\"done\"}]}}\n",
	)

	session, err := ParseClaude(path)
	if err != nil {
		t.Fatalf("ParseClaude returned error: %v", err)
	}
	if len(session.Events) != 1 || session.Events[0].Content != "done" {
		t.Fatalf("expected no-output tool result to be skipped, got %+v", session.Events)
	}
}

func TestParseClaudeSupportsArrayToolUseResult(t *testing.T) {
	path := writeTestFile(t, "claude-array-tool-result.jsonl", ""+
		"{\"type\":\"user\",\"timestamp\":\"2026-03-11T12:00:00Z\",\"message\":{\"content\":[{\"type\":\"tool_result\",\"content\":[{\"type\":\"text\",\"text\":\"No notes stored\"}]}]},\"toolUseResult\":[{\"type\":\"text\",\"text\":\"No notes stored\"}]}\n",
	)

	session, err := ParseClaude(path)
	if err != nil {
		t.Fatalf("ParseClaude returned error: %v", err)
	}
	if len(session.Events) != 1 || session.Events[0].ToolResult != "No notes stored" {
		t.Fatalf("expected array-backed tool result event, got %+v", session.Events)
	}
}

func TestParseCodexRejectsMalformedJSONLBeforeViewerExport(t *testing.T) {
	path := writeTestFile(t, "codex-invalid.jsonl", ""+
		"{\"type\":\"session_meta\",\"payload\":{\"id\":\"codex-session\",\"timestamp\":\"2026-03-11T13:00:00Z\"}}\n"+
		"{\"type\":\"message\",\"timestamp\":\"2026-03-11T13:00:01Z\",\"role\":\"user\",\"content\":oops}\n",
	)

	_, err := ParseCodex(path)
	if err == nil {
		t.Fatal("expected malformed Codex JSONL to fail")
	}
	if !strings.Contains(err.Error(), "line 2") {
		t.Fatalf("expected line number in error, got %v", err)
	}
}

func TestParseCodexRejectsUnsupportedResponseItem(t *testing.T) {
	path := writeTestFile(t, "codex-invalid-response-item.jsonl", ""+
		"{\"type\":\"session_meta\",\"payload\":{\"id\":\"codex-session\",\"timestamp\":\"2026-03-11T13:00:00Z\"}}\n"+
		"{\"type\":\"response_item\",\"timestamp\":\"2026-03-11T13:00:01Z\",\"payload\":{\"type\":\"unknown\"}}\n",
	)

	_, err := ParseCodex(path)
	if err == nil {
		t.Fatal("expected unsupported response item to fail")
	}
	if !strings.Contains(err.Error(), "unsupported response item type") {
		t.Fatalf("expected unsupported response item error, got %v", err)
	}
}

func TestParseCodexRejectsUnsupportedMessageContent(t *testing.T) {
	path := writeTestFile(t, "codex-invalid-message.jsonl", ""+
		"{\"id\":\"codex-session\",\"timestamp\":\"2026-03-11T13:00:00Z\"}\n"+
		"{\"type\":\"message\",\"timestamp\":\"2026-03-11T13:00:01Z\",\"role\":\"user\",\"content\":\"bad\"}\n",
	)

	_, err := ParseCodex(path)
	if err == nil {
		t.Fatal("expected unsupported Codex message content to fail")
	}
	if !strings.Contains(err.Error(), "unsupported message content format") {
		t.Fatalf("expected unsupported message content error, got %v", err)
	}
}

func TestResolveSessionPathRejectsNonJSONLAndNonRegularFiles(t *testing.T) {
	dir := t.TempDir()
	textPath := filepath.Join(dir, "session.txt")
	if err := os.WriteFile(textPath, []byte("nope"), 0o644); err != nil {
		t.Fatalf("failed to write text file: %v", err)
	}

	if _, err := ResolveSessionPath(textPath); err == nil {
		t.Fatal("expected non-.jsonl file to be rejected")
	}
	if _, err := ResolveSessionPath(dir); err == nil {
		t.Fatal("expected directory path to be rejected")
	}
}

func TestResolveSessionPathRejectsSymlinkAndOversizedFiles(t *testing.T) {
	dir := t.TempDir()
	targetPath := filepath.Join(dir, "session.jsonl")
	if err := os.WriteFile(targetPath, []byte("{}\n"), 0o644); err != nil {
		t.Fatalf("failed to write target file: %v", err)
	}

	linkPath := filepath.Join(dir, "session-link.jsonl")
	if err := os.Symlink(targetPath, linkPath); err != nil {
		t.Fatalf("failed to create symlink: %v", err)
	}
	if _, err := ResolveSessionPath(linkPath); err == nil {
		t.Fatal("expected symlink path to be rejected")
	}

	largePath := filepath.Join(dir, "large.jsonl")
	f, err := os.Create(largePath)
	if err != nil {
		t.Fatalf("failed to create large file: %v", err)
	}
	if err := f.Truncate(maxSessionFileSize + 1); err != nil {
		f.Close()
		t.Fatalf("failed to size large file: %v", err)
	}
	if err := f.Close(); err != nil {
		t.Fatalf("failed to close large file: %v", err)
	}
	if _, err := ResolveSessionPath(largePath); err == nil {
		t.Fatal("expected oversized session file to be rejected")
	}
}

func TestFindCodexSessionIgnoresSymlinkMatches(t *testing.T) {
	tempHome := t.TempDir()
	t.Setenv("HOME", tempHome)

	sessionsDir := filepath.Join(tempHome, ".codex", "sessions")
	linkDir := filepath.Join(sessionsDir, "2026", "03", "11")
	realDir := filepath.Join(sessionsDir, "2026", "03", "12")
	if err := os.MkdirAll(linkDir, 0o755); err != nil {
		t.Fatalf("failed to create symlink dir: %v", err)
	}
	if err := os.MkdirAll(realDir, 0o755); err != nil {
		t.Fatalf("failed to create real dir: %v", err)
	}

	targetFile := filepath.Join(t.TempDir(), "outside-target.jsonl")
	if err := os.WriteFile(targetFile, []byte("{}\n"), 0o644); err != nil {
		t.Fatalf("failed to write symlink target: %v", err)
	}
	sessionID := "abc123"
	if err := os.Symlink(targetFile, filepath.Join(linkDir, "rollout-2026-03-11T00-00-00-"+sessionID+".jsonl")); err != nil {
		t.Fatalf("failed to create symlink session file: %v", err)
	}

	realPath := filepath.Join(realDir, "rollout-2026-03-12T00-00-01-"+sessionID+".jsonl")
	if err := os.WriteFile(realPath, []byte("{}\n"), 0o644); err != nil {
		t.Fatalf("failed to write real session file: %v", err)
	}
	resolvedRealPath, err := ResolveSessionPath(realPath)
	if err != nil {
		t.Fatalf("failed to resolve real session path: %v", err)
	}

	found, err := FindCodexSession(sessionID)
	if err != nil {
		t.Fatalf("FindCodexSession returned error: %v", err)
	}
	if found != resolvedRealPath {
		t.Fatalf("expected regular session file, got %q", found)
	}
}

func TestFindClaudeSessionIgnoresSymlinkedProjectDirectories(t *testing.T) {
	tempHome := t.TempDir()
	t.Setenv("HOME", tempHome)

	projectsDir := filepath.Join(tempHome, ".claude", "projects")
	realProjectDir := filepath.Join(projectsDir, "real-project")
	if err := os.MkdirAll(realProjectDir, 0o755); err != nil {
		t.Fatalf("failed to create real project dir: %v", err)
	}

	outsideDir := filepath.Join(t.TempDir(), "outside-project")
	if err := os.MkdirAll(outsideDir, 0o755); err != nil {
		t.Fatalf("failed to create outside project dir: %v", err)
	}
	if err := os.Symlink(outsideDir, filepath.Join(projectsDir, "linked-project")); err != nil {
		t.Fatalf("failed to create linked project dir: %v", err)
	}

	sessionID := "claude-session-id"
	outsidePath := filepath.Join(outsideDir, sessionID+".jsonl")
	if err := os.WriteFile(outsidePath, []byte("{}\n"), 0o644); err != nil {
		t.Fatalf("failed to write outside session file: %v", err)
	}

	realPath := filepath.Join(realProjectDir, sessionID+".jsonl")
	if err := os.WriteFile(realPath, []byte("{}\n"), 0o644); err != nil {
		t.Fatalf("failed to write real session file: %v", err)
	}
	resolvedRealPath, err := ResolveSessionPath(realPath)
	if err != nil {
		t.Fatalf("failed to resolve real session path: %v", err)
	}

	found, err := FindClaudeSession(sessionID)
	if err != nil {
		t.Fatalf("FindClaudeSession returned error: %v", err)
	}
	if found != resolvedRealPath {
		t.Fatalf("expected real project session file, got %q", found)
	}
}

func TestFindCodexSessionIgnoresSymlinkedDateDirectories(t *testing.T) {
	tempHome := t.TempDir()
	t.Setenv("HOME", tempHome)

	sessionsDir := filepath.Join(tempHome, ".codex", "sessions")
	realDir := filepath.Join(sessionsDir, "2026", "03", "12")
	if err := os.MkdirAll(realDir, 0o755); err != nil {
		t.Fatalf("failed to create real codex dir: %v", err)
	}

	outsideDir := filepath.Join(t.TempDir(), "outside-codex")
	if err := os.MkdirAll(outsideDir, 0o755); err != nil {
		t.Fatalf("failed to create outside codex dir: %v", err)
	}

	linkedMonthDir := filepath.Join(sessionsDir, "2026", "03", "11")
	if err := os.MkdirAll(filepath.Dir(linkedMonthDir), 0o755); err != nil {
		t.Fatalf("failed to create parent codex dir: %v", err)
	}
	if err := os.Symlink(outsideDir, linkedMonthDir); err != nil {
		t.Fatalf("failed to create linked codex dir: %v", err)
	}

	sessionID := "codex-session-id"
	outsidePath := filepath.Join(outsideDir, "rollout-2026-03-11T00-00-00-"+sessionID+".jsonl")
	if err := os.WriteFile(outsidePath, []byte("{}\n"), 0o644); err != nil {
		t.Fatalf("failed to write outside codex session file: %v", err)
	}

	realPath := filepath.Join(realDir, "rollout-2026-03-12T00-00-01-"+sessionID+".jsonl")
	if err := os.WriteFile(realPath, []byte("{}\n"), 0o644); err != nil {
		t.Fatalf("failed to write real codex session file: %v", err)
	}
	resolvedRealPath, err := ResolveSessionPath(realPath)
	if err != nil {
		t.Fatalf("failed to resolve real codex session path: %v", err)
	}

	found, err := FindCodexSession(sessionID)
	if err != nil {
		t.Fatalf("FindCodexSession returned error: %v", err)
	}
	if found != resolvedRealPath {
		t.Fatalf("expected real codex session file, got %q", found)
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
