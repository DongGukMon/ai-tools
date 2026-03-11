package parser

import (
	"bufio"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"time"
)

type claudeLine struct {
	Type          string               `json:"type"`
	Timestamp     string               `json:"timestamp"`
	SessionID     string               `json:"sessionId"`
	CWD           string               `json:"cwd"`
	Message       json.RawMessage      `json:"message"`
	ToolUseResult *claudeToolUseResult `json:"toolUseResult"`
}

type claudeToolUseResult struct {
	File *struct {
		Content string `json:"content"`
	} `json:"file"`
}

type claudeMessage struct {
	Model   string          `json:"model"`
	Content json.RawMessage `json:"content"`
}

type claudeContentBlock struct {
	Type     string          `json:"type"`
	Text     string          `json:"text"`
	Thinking string          `json:"thinking"`
	Name     string          `json:"name"`
	Input    json.RawMessage `json:"input"`
	Content  json.RawMessage `json:"content"`
}

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
		Events:  make([]TimelineEvent, 0, estimateEventCapacity(fileSize(f))),
	}

	scanner := bufio.NewScanner(f)
	scanner.Buffer(make([]byte, 0, 64*1024), 10*1024*1024)

	for scanner.Scan() {
		lineBytes := scanner.Bytes()
		if len(lineBytes) == 0 {
			continue
		}

		var line claudeLine
		if err := json.Unmarshal(lineBytes, &line); err != nil {
			continue
		}

		if sess.ID == "" && line.SessionID != "" {
			sess.ID = line.SessionID
		}
		if sess.CWD == "" && line.CWD != "" {
			sess.CWD = line.CWD
		}

		switch line.Type {
		case "user", "assistant":
		case "progress", "file-history-snapshot", "last-prompt":
			continue
		default:
			continue
		}

		var msg claudeMessage
		if len(line.Message) == 0 || json.Unmarshal(line.Message, &msg) != nil {
			continue
		}

		if sess.Model == "" && line.Type == "assistant" && msg.Model != "" {
			sess.Model = msg.Model
		}

		ts := parseTimestamp(line.Timestamp)

		switch line.Type {
		case "user":
			sess.Events = append(sess.Events, parseClaudeUserMessage(msg, line.ToolUseResult, ts)...)
		case "assistant":
			sess.Events = append(sess.Events, parseClaudeAssistantMessage(msg, ts)...)
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

func parseClaudeUserMessage(msg claudeMessage, toolUseResult *claudeToolUseResult, ts time.Time) []TimelineEvent {
	var textContent string
	if err := json.Unmarshal(msg.Content, &textContent); err == nil {
		if textContent == "" {
			return nil
		}
		return []TimelineEvent{{
			Timestamp: ts,
			Type:      "user",
			Role:      "user",
			Summary:   truncate(firstLine(textContent), 100),
			Content:   textContent,
		}}
	}

	var blocks []claudeContentBlock
	if err := json.Unmarshal(msg.Content, &blocks); err != nil {
		return nil
	}

	var fileContent string
	if toolUseResult != nil && toolUseResult.File != nil {
		fileContent = toolUseResult.File.Content
	}

	events := make([]TimelineEvent, 0, len(blocks))
	for _, block := range blocks {
		switch block.Type {
		case "text":
			if block.Text == "" {
				continue
			}
			events = append(events, TimelineEvent{
				Timestamp: ts,
				Type:      "user",
				Role:      "user",
				Summary:   truncate(firstLine(block.Text), 100),
				Content:   block.Text,
			})

		case "tool_result":
			resultContent := rawMessageAsString(block.Content)
			if fileContent != "" {
				resultContent = fileContent
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

func parseClaudeAssistantMessage(msg claudeMessage, ts time.Time) []TimelineEvent {
	var blocks []claudeContentBlock
	if err := json.Unmarshal(msg.Content, &blocks); err != nil {
		return nil
	}

	events := make([]TimelineEvent, 0, len(blocks))
	for _, block := range blocks {
		switch block.Type {
		case "text":
			if block.Text == "" {
				continue
			}
			events = append(events, TimelineEvent{
				Timestamp: ts,
				Type:      "assistant",
				Role:      "assistant",
				Summary:   truncate(firstLine(block.Text), 100),
				Content:   block.Text,
			})

		case "thinking":
			events = append(events, TimelineEvent{
				Timestamp: ts,
				Type:      "thinking",
				Role:      "assistant",
				Summary:   "(thinking)",
				Content:   block.Thinking,
			})

		case "tool_use":
			input := rawMessageAsString(block.Input)
			events = append(events, TimelineEvent{
				Timestamp: ts,
				Type:      "tool_call",
				Role:      "assistant",
				Summary:   fmt.Sprintf("Tool: %s", block.Name),
				Content:   input,
				ToolName:  block.Name,
				ToolInput: input,
			})
		}
	}

	return events
}
