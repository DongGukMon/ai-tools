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

// FindClaudeSession locates a Claude session JSONL file by session ID.
func FindClaudeSession(sessionID string) (string, error) {
	homeDir, err := os.UserHomeDir()
	if err != nil {
		return "", fmt.Errorf("failed to get home directory: %w", err)
	}

	projectsDir := filepath.Join(homeDir, ".claude", "projects")
	target := sessionID + ".jsonl"

	var found string
	filepath.Walk(projectsDir, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return nil
		}
		if !info.IsDir() && info.Name() == target {
			found = path
			return filepath.SkipAll
		}
		return nil
	})

	if found == "" {
		return "", fmt.Errorf("session file not found: %s under %s", target, projectsDir)
	}
	return found, nil
}

// ParseClaude parses a Claude JSONL session file into a normalized Session.
func ParseClaude(path string) (*Session, error) {
	f, err := os.Open(path)
	if err != nil {
		return nil, fmt.Errorf("failed to open file: %w", err)
	}
	defer f.Close()

	sess := &Session{
		Backend: "claude",
		Events:  []TimelineEvent{},
	}

	scanner := bufio.NewScanner(f)
	scanner.Buffer(make([]byte, 0, 64*1024), 10*1024*1024)

	for scanner.Scan() {
		line := scanner.Bytes()
		if len(line) == 0 {
			continue
		}

		var raw map[string]json.RawMessage
		if err := json.Unmarshal(line, &raw); err != nil {
			continue
		}

		var eventType string
		if t, ok := raw["type"]; ok {
			json.Unmarshal(t, &eventType)
		}

		var ts time.Time
		if t, ok := raw["timestamp"]; ok {
			var tsStr string
			json.Unmarshal(t, &tsStr)
			ts, _ = time.Parse(time.RFC3339Nano, tsStr)
		}

		// Extract session metadata
		if sess.ID == "" {
			if sid, ok := raw["sessionId"]; ok {
				json.Unmarshal(sid, &sess.ID)
			}
		}
		if sess.CWD == "" {
			if cwd, ok := raw["cwd"]; ok {
				json.Unmarshal(cwd, &sess.CWD)
			}
		}

		switch eventType {
		case "user":
			events := parseClaudeUserMessage(raw, ts)
			sess.Events = append(sess.Events, events...)

		case "assistant":
			events := parseClaudeAssistantMessage(raw, ts)
			if sess.Model == "" {
				if msg, ok := raw["message"]; ok {
					var m map[string]json.RawMessage
					if json.Unmarshal(msg, &m) == nil {
						if model, ok := m["model"]; ok {
							json.Unmarshal(model, &sess.Model)
						}
					}
				}
			}
			sess.Events = append(sess.Events, events...)

		case "progress", "file-history-snapshot", "last-prompt":
			// Skip non-conversation events
			continue
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

func parseClaudeUserMessage(raw map[string]json.RawMessage, ts time.Time) []TimelineEvent {
	msgRaw, ok := raw["message"]
	if !ok {
		return nil
	}

	var msg struct {
		Content json.RawMessage `json:"content"`
	}
	if err := json.Unmarshal(msgRaw, &msg); err != nil {
		return nil
	}

	// content can be a string or an array
	var textContent string
	if err := json.Unmarshal(msg.Content, &textContent); err == nil {
		return []TimelineEvent{{
			Timestamp: ts,
			Type:      "user",
			Role:      "user",
			Summary:   truncate(firstLine(textContent), 100),
			Content:   textContent,
		}}
	}

	// content is an array
	var contentArr []map[string]json.RawMessage
	if err := json.Unmarshal(msg.Content, &contentArr); err != nil {
		return nil
	}

	var events []TimelineEvent
	for _, block := range contentArr {
		var blockType string
		if t, ok := block["type"]; ok {
			json.Unmarshal(t, &blockType)
		}

		switch blockType {
		case "text":
			var text string
			json.Unmarshal(block["text"], &text)
			events = append(events, TimelineEvent{
				Timestamp: ts,
				Type:      "user",
				Role:      "user",
				Summary:   truncate(firstLine(text), 100),
				Content:   text,
			})

		case "tool_result":
			var toolUseID string
			if id, ok := block["tool_use_id"]; ok {
				json.Unmarshal(id, &toolUseID)
			}

			var resultContent string
			if c, ok := block["content"]; ok {
				// content can be string or complex
				if err := json.Unmarshal(c, &resultContent); err != nil {
					resultContent = string(c)
				}
			}

			// Check toolUseResult for richer content
			if tur, ok := raw["toolUseResult"]; ok {
				var toolResult map[string]json.RawMessage
				if json.Unmarshal(tur, &toolResult) == nil {
					if fileRaw, ok := toolResult["file"]; ok {
						var file struct {
							FilePath string `json:"filePath"`
							Content  string `json:"content"`
						}
						if json.Unmarshal(fileRaw, &file) == nil && file.Content != "" {
							resultContent = file.Content
						}
					}
				}
			}

			events = append(events, TimelineEvent{
				Timestamp:  ts,
				Type:       "tool_result",
				Role:       "user",
				Summary:    fmt.Sprintf("Result: %s", truncate(firstLine(resultContent), 80)),
				Content:    resultContent,
				ToolResult: resultContent,
			})
		}
	}

	return events
}

func parseClaudeAssistantMessage(raw map[string]json.RawMessage, ts time.Time) []TimelineEvent {
	msgRaw, ok := raw["message"]
	if !ok {
		return nil
	}

	var msg struct {
		Content json.RawMessage `json:"content"`
	}
	if err := json.Unmarshal(msgRaw, &msg); err != nil {
		return nil
	}

	var contentArr []map[string]json.RawMessage
	if err := json.Unmarshal(msg.Content, &contentArr); err != nil {
		return nil
	}

	var events []TimelineEvent
	for _, block := range contentArr {
		var blockType string
		if t, ok := block["type"]; ok {
			json.Unmarshal(t, &blockType)
		}

		switch blockType {
		case "text":
			var text string
			json.Unmarshal(block["text"], &text)
			if text == "" {
				continue
			}
			events = append(events, TimelineEvent{
				Timestamp: ts,
				Type:      "assistant",
				Role:      "assistant",
				Summary:   truncate(firstLine(text), 100),
				Content:   text,
			})

		case "thinking":
			var thinking string
			json.Unmarshal(block["thinking"], &thinking)
			events = append(events, TimelineEvent{
				Timestamp: ts,
				Type:      "thinking",
				Role:      "assistant",
				Summary:   "(thinking)",
				Content:   thinking,
			})

		case "tool_use":
			var name string
			if n, ok := block["name"]; ok {
				json.Unmarshal(n, &name)
			}
			var inputStr string
			if inp, ok := block["input"]; ok {
				inputStr = string(inp)
			}

			events = append(events, TimelineEvent{
				Timestamp: ts,
				Type:      "tool_call",
				Role:      "assistant",
				Summary:   fmt.Sprintf("Tool: %s", name),
				Content:   inputStr,
				ToolName:  name,
				ToolInput: inputStr,
			})
		}
	}

	return events
}

func firstLine(s string) string {
	s = strings.TrimSpace(s)
	if idx := strings.IndexByte(s, '\n'); idx >= 0 {
		return s[:idx]
	}
	return s
}
