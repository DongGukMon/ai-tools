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

type claudeLine struct {
	Type          string          `json:"type"`
	Timestamp     string          `json:"timestamp"`
	SessionID     string          `json:"sessionId"`
	CWD           string          `json:"cwd"`
	Message       json.RawMessage `json:"message"`
	ToolUseResult json.RawMessage `json:"toolUseResult"`
}

type claudeToolUseResult struct {
	Type             string `json:"type"`
	Text             string
	Stdout           string `json:"stdout"`
	Stderr           string `json:"stderr"`
	Interrupted      bool   `json:"interrupted"`
	IsImage          bool   `json:"isImage"`
	NoOutputExpected bool   `json:"noOutputExpected"`
	File             *struct {
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
	if err := validateSessionID(sessionID); err != nil {
		return "", err
	}

	homeDir, err := os.UserHomeDir()
	if err != nil {
		return "", fmt.Errorf("failed to get home directory: %w", err)
	}

	projectsDir := filepath.Join(homeDir, ".claude", "projects")
	target := sessionID + ".jsonl"

	matches, err := filepath.Glob(filepath.Join(projectsDir, "*", target))
	if err != nil {
		return "", fmt.Errorf("failed to search session files under %s: %w", projectsDir, err)
	}

	validMatches := make([]string, 0, len(matches))
	for _, match := range matches {
		resolved, err := resolveDiscoveredSessionPath(projectsDir, match)
		if err == nil {
			validMatches = append(validMatches, resolved)
		}
	}

	switch len(validMatches) {
	case 0:
		return "", fmt.Errorf("session file not found: %s under %s", target, projectsDir)
	case 1:
		return validMatches[0], nil
	default:
		return "", fmt.Errorf("multiple session files matched %s under %s", target, projectsDir)
	}
}

// ParseClaude parses a Claude JSONL session file into a normalized Session.
func ParseClaude(path string) (*Session, error) {
	path, err := ResolveSessionPath(path)
	if err != nil {
		return nil, err
	}

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

	lineNum := 0
	for scanner.Scan() {
		lineNum++
		lineBytes := scanner.Bytes()
		if len(lineBytes) == 0 {
			continue
		}

		var line claudeLine
		if err := json.Unmarshal(lineBytes, &line); err != nil {
			return nil, fmt.Errorf("invalid Claude JSON on line %d: %w", lineNum, err)
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
		if len(line.Message) == 0 {
			return nil, fmt.Errorf("invalid Claude message on line %d: message payload is empty", lineNum)
		}
		if err := json.Unmarshal(line.Message, &msg); err != nil {
			return nil, fmt.Errorf("invalid Claude message on line %d: %w", lineNum, err)
		}

		if sess.Model == "" && line.Type == "assistant" && msg.Model != "" {
			sess.Model = msg.Model
		}

		toolUseResult, err := parseClaudeToolUseResult(line.ToolUseResult)
		if err != nil {
			return nil, fmt.Errorf("invalid Claude tool result on line %d: %w", lineNum, err)
		}

		ts, err := parseTimestampStrict(line.Timestamp)
		if err != nil {
			return nil, fmt.Errorf("invalid Claude timestamp on line %d: %w", lineNum, err)
		}

		var events []TimelineEvent
		switch line.Type {
		case "user":
			events, err = parseClaudeUserMessage(msg, toolUseResult, ts)
		case "assistant":
			events, err = parseClaudeAssistantMessage(msg, ts)
		}
		if err != nil {
			return nil, fmt.Errorf("invalid Claude event on line %d: %w", lineNum, err)
		}
		sess.Events = append(sess.Events, events...)
	}

	if err := scanner.Err(); err != nil {
		return nil, fmt.Errorf("error reading file: %w", err)
	}
	if len(sess.Events) == 0 {
		return nil, fmt.Errorf("no supported Claude events found in session")
	}

	sess.StartedAt = sess.Events[0].Timestamp

	return sess, nil
}

func parseClaudeToolUseResult(raw json.RawMessage) (*claudeToolUseResult, error) {
	if len(raw) == 0 {
		return nil, nil
	}

	var text string
	if err := json.Unmarshal(raw, &text); err == nil {
		return &claudeToolUseResult{Text: text}, nil
	}
	if text, ok := claudeInlineText(raw); ok {
		return &claudeToolUseResult{Text: text}, nil
	}

	var result claudeToolUseResult
	if err := json.Unmarshal(raw, &result); err != nil {
		return nil, err
	}

	return &result, nil
}

func parseClaudeUserMessage(msg claudeMessage, toolUseResult *claudeToolUseResult, ts time.Time) ([]TimelineEvent, error) {
	if len(msg.Content) == 0 {
		return nil, fmt.Errorf("message content is empty")
	}

	var textContent string
	if err := json.Unmarshal(msg.Content, &textContent); err == nil {
		if textContent == "" {
			return nil, fmt.Errorf("message text content is empty")
		}
		return []TimelineEvent{{
			Timestamp: ts,
			Type:      "user",
			Role:      "user",
			Summary:   truncate(firstLine(textContent), 100),
			Content:   textContent,
		}}, nil
	}

	var blocks []claudeContentBlock
	if err := json.Unmarshal(msg.Content, &blocks); err != nil {
		return nil, fmt.Errorf("unsupported message content format")
	}

	toolResultContent, preferToolUseResult := claudeToolResultContent(toolUseResult)
	events := make([]TimelineEvent, 0, len(blocks))
	sawToolResult := false
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
			sawToolResult = true
			resultContent := claudeToolResultValue(block.Content)
			switch {
			case preferToolUseResult && toolResultContent != "":
				resultContent = toolResultContent
			case resultContent == "" && toolResultContent != "":
				resultContent = toolResultContent
			}
			if resultContent == "" {
				continue
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

	if len(events) == 0 {
		if sawToolResult {
			return nil, nil
		}
		return nil, fmt.Errorf("message produced no supported events")
	}

	return events, nil
}

func claudeToolResultContent(result *claudeToolUseResult) (content string, prefer bool) {
	if result == nil {
		return "", false
	}
	if result.File != nil && result.File.Content != "" {
		return result.File.Content, true
	}
	if result.Stdout != "" || result.Stderr != "" {
		parts := make([]string, 0, 2)
		if result.Stdout != "" {
			parts = append(parts, result.Stdout)
		}
		if result.Stderr != "" {
			parts = append(parts, result.Stderr)
		}
		return strings.Join(parts, "\n"), true
	}
	if result.Text != "" {
		return result.Text, false
	}
	return "", false
}

func claudeToolResultValue(raw json.RawMessage) string {
	if text, ok := claudeInlineText(raw); ok {
		return text
	}
	return rawMessageAsString(raw)
}

func claudeInlineText(raw json.RawMessage) (string, bool) {
	if len(raw) == 0 {
		return "", false
	}

	var blocks []claudeContentBlock
	if err := json.Unmarshal(raw, &blocks); err != nil {
		return "", false
	}

	parts := make([]string, 0, len(blocks))
	for _, block := range blocks {
		if block.Type == "text" && block.Text != "" {
			parts = append(parts, block.Text)
		}
	}
	if len(parts) == 0 {
		return "", false
	}
	return strings.Join(parts, "\n"), true
}

func parseClaudeAssistantMessage(msg claudeMessage, ts time.Time) ([]TimelineEvent, error) {
	if len(msg.Content) == 0 {
		return nil, fmt.Errorf("message content is empty")
	}

	var blocks []claudeContentBlock
	if err := json.Unmarshal(msg.Content, &blocks); err != nil {
		return nil, fmt.Errorf("unsupported assistant content format")
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

	if len(events) == 0 {
		return nil, fmt.Errorf("message produced no supported events")
	}

	return events, nil
}
