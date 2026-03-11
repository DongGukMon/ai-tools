package parser

import (
	"bufio"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"
)

// FindCodexSession locates a Codex session JSONL file by session ID.
func FindCodexSession(sessionID string) (string, error) {
	homeDir, err := os.UserHomeDir()
	if err != nil {
		return "", fmt.Errorf("failed to get home directory: %w", err)
	}

	sessionsDir := filepath.Join(homeDir, ".codex", "sessions")
	suffix := "-" + sessionID + ".jsonl"

	var found string
	filepath.Walk(sessionsDir, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return nil
		}
		if !info.IsDir() && strings.HasSuffix(info.Name(), suffix) {
			found = path
			return filepath.SkipAll
		}
		return nil
	})

	if found == "" {
		return "", fmt.Errorf("session file not found: *%s under %s", suffix, sessionsDir)
	}
	return found, nil
}

// ParseCodex parses a Codex JSONL session file into a normalized Session.
func ParseCodex(path string) (*Session, error) {
	f, err := os.Open(path)
	if err != nil {
		return nil, fmt.Errorf("failed to open file: %w", err)
	}
	defer f.Close()

	sess := &Session{
		Backend: "codex",
		Events:  []TimelineEvent{},
	}

	scanner := bufio.NewScanner(f)
	scanner.Buffer(make([]byte, 0, 64*1024), 10*1024*1024)

	lineNum := 0
	for scanner.Scan() {
		line := scanner.Bytes()
		if len(line) == 0 {
			continue
		}
		lineNum++

		var raw map[string]json.RawMessage
		if err := json.Unmarshal(line, &raw); err != nil {
			continue
		}

		// First line is typically session metadata
		if lineNum == 1 {
			parseCodexMetadata(raw, sess)
			continue
		}

		// Check for record_type
		if rt, ok := raw["record_type"]; ok {
			var recordType string
			json.Unmarshal(rt, &recordType)
			if recordType == "state" {
				continue
			}
		}

		// Check for type field
		var msgType string
		if t, ok := raw["type"]; ok {
			json.Unmarshal(t, &msgType)
		}

		switch msgType {
		case "message":
			events := parseCodexMessage(raw)
			sess.Events = append(sess.Events, events...)

		case "reasoning":
			event := parseCodexReasoning(raw)
			if event != nil {
				sess.Events = append(sess.Events, *event)
			}
		}
	}

	if err := scanner.Err(); err != nil {
		return nil, fmt.Errorf("error reading file: %w", err)
	}

	if len(sess.Events) > 0 {
		sess.StartedAt = sess.Events[0].Timestamp
	}

	return sess, nil
}

func parseCodexMetadata(raw map[string]json.RawMessage, sess *Session) {
	if id, ok := raw["id"]; ok {
		json.Unmarshal(id, &sess.ID)
	}
	if ts, ok := raw["timestamp"]; ok {
		var tsStr string
		json.Unmarshal(ts, &tsStr)
		sess.StartedAt, _ = time.Parse(time.RFC3339Nano, tsStr)
	}
}

func parseCodexMessage(raw map[string]json.RawMessage) []TimelineEvent {
	var role string
	if r, ok := raw["role"]; ok {
		json.Unmarshal(r, &role)
	}

	contentRaw, ok := raw["content"]
	if !ok {
		return nil
	}

	var contentArr []map[string]json.RawMessage
	if err := json.Unmarshal(contentRaw, &contentArr); err != nil {
		return nil
	}

	var events []TimelineEvent
	for _, block := range contentArr {
		var blockType string
		if t, ok := block["type"]; ok {
			json.Unmarshal(t, &blockType)
		}

		switch blockType {
		case "input_text":
			var text string
			if t, ok := block["text"]; ok {
				json.Unmarshal(t, &text)
			}
			events = append(events, TimelineEvent{
				Type:    "user",
				Role:    "user",
				Summary: truncate(firstLine(text), 100),
				Content: text,
			})

		case "output_text", "text":
			var text string
			if t, ok := block["text"]; ok {
				json.Unmarshal(t, &text)
			}
			events = append(events, TimelineEvent{
				Type:    "assistant",
				Role:    "assistant",
				Summary: truncate(firstLine(text), 100),
				Content: text,
			})

		case "tool_call":
			var name string
			if n, ok := block["name"]; ok {
				json.Unmarshal(n, &name)
			}
			var inputStr string
			if inp, ok := block["arguments"]; ok {
				inputStr = string(inp)
			}
			events = append(events, TimelineEvent{
				Type:      "tool_call",
				Role:      "assistant",
				Summary:   fmt.Sprintf("Tool: %s", name),
				Content:   inputStr,
				ToolName:  name,
				ToolInput: inputStr,
			})

		case "tool_result":
			var output string
			if o, ok := block["output"]; ok {
				json.Unmarshal(o, &output)
			}
			events = append(events, TimelineEvent{
				Type:       "tool_result",
				Role:       "user",
				Summary:    fmt.Sprintf("Result: %s", truncate(firstLine(output), 80)),
				Content:    output,
				ToolResult: output,
			})
		}
	}

	return events
}

func parseCodexReasoning(raw map[string]json.RawMessage) *TimelineEvent {
	var summaryArr []map[string]json.RawMessage
	if s, ok := raw["summary"]; ok {
		json.Unmarshal(s, &summaryArr)
	}

	var summaryText string
	for _, item := range summaryArr {
		var sType string
		if t, ok := item["type"]; ok {
			json.Unmarshal(t, &sType)
		}
		if sType == "summary_text" {
			var text string
			if t, ok := item["text"]; ok {
				json.Unmarshal(t, &text)
			}
			summaryText += text
		}
	}

	return &TimelineEvent{
		Type:    "thinking",
		Role:    "assistant",
		Summary: "(thinking)",
		Content: summaryText,
	}
}
