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

type codexLine struct {
	ID         string          `json:"id"`
	Timestamp  string          `json:"timestamp"`
	RecordType string          `json:"record_type"`
	Type       string          `json:"type"`
	Role       string          `json:"role"`
	Content    json.RawMessage `json:"content"`
	Summary    json.RawMessage `json:"summary"`
	Payload    json.RawMessage `json:"payload"`
}

type codexSessionMeta struct {
	ID        string `json:"id"`
	Timestamp string `json:"timestamp"`
	CWD       string `json:"cwd"`
	Model     string `json:"model"`
}

type codexResponseItem struct {
	Type      string          `json:"type"`
	Role      string          `json:"role"`
	Name      string          `json:"name"`
	Status    string          `json:"status"`
	Content   json.RawMessage `json:"content"`
	Summary   json.RawMessage `json:"summary"`
	Arguments json.RawMessage `json:"arguments"`
	Input     json.RawMessage `json:"input"`
	Action    json.RawMessage `json:"action"`
	Output    string          `json:"output"`
}

type codexContentBlock struct {
	Type      string          `json:"type"`
	Text      string          `json:"text"`
	Name      string          `json:"name"`
	Arguments json.RawMessage `json:"arguments"`
	Output    string          `json:"output"`
}

type codexSummaryBlock struct {
	Type string `json:"type"`
	Text string `json:"text"`
}

// FindCodexSession locates a Codex session JSONL file by session ID.
func FindCodexSession(sessionID string) (string, error) {
	if err := validateSessionID(sessionID); err != nil {
		return "", err
	}

	homeDir, err := os.UserHomeDir()
	if err != nil {
		return "", fmt.Errorf("failed to get home directory: %w", err)
	}

	sessionsDir := filepath.Join(homeDir, ".codex", "sessions")
	pattern := filepath.Join(sessionsDir, "*", "*", "*", "*-"+sessionID+".jsonl")
	matches, err := filepath.Glob(pattern)
	if err != nil {
		return "", fmt.Errorf("failed to search session files under %s: %w", sessionsDir, err)
	}

	validMatches := make([]string, 0, len(matches))
	for _, match := range matches {
		resolved, err := resolveDiscoveredSessionPath(sessionsDir, match)
		if err == nil {
			validMatches = append(validMatches, resolved)
		}
	}

	switch len(validMatches) {
	case 0:
		return "", fmt.Errorf("session file not found: %s under %s", filepath.Base(pattern), sessionsDir)
	case 1:
		return validMatches[0], nil
	default:
		return "", fmt.Errorf("multiple session files matched %s under %s", filepath.Base(pattern), sessionsDir)
	}
}

// ParseCodex parses a Codex JSONL session file into a normalized Session.
func ParseCodex(path string) (*Session, error) {
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
		Backend: "codex",
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

		var line codexLine
		if err := json.Unmarshal(lineBytes, &line); err != nil {
			return nil, fmt.Errorf("invalid Codex JSON on line %d: %w", lineNum, err)
		}

		if lineNum == 1 && line.Type == "" {
			if err := parseCodexMetadata(line, sess); err != nil {
				return nil, fmt.Errorf("invalid Codex session metadata on line %d: %w", lineNum, err)
			}
			continue
		}

		if line.Type == "session_meta" {
			if err := parseCodexSessionMeta(line, sess); err != nil {
				return nil, fmt.Errorf("invalid Codex session metadata on line %d: %w", lineNum, err)
			}
			continue
		}

		if line.RecordType == "state" {
			continue
		}

		var ts time.Time
		if line.Type == "message" || line.Type == "reasoning" || line.Type == "response_item" {
			ts, err = parseTimestampStrict(line.Timestamp)
			if err != nil {
				return nil, fmt.Errorf("invalid Codex timestamp on line %d: %w", lineNum, err)
			}
		}

		var events []TimelineEvent
		switch line.Type {
		case "message":
			events, err = parseCodexMessage(line.Role, line.Content, ts)
		case "reasoning":
			var event *TimelineEvent
			event, err = parseCodexReasoning(line.Summary, ts)
			if err == nil {
				events = []TimelineEvent{*event}
			}
		case "response_item":
			events, err = parseCodexResponseItem(line.Payload, ts)
		}
		if err != nil {
			return nil, fmt.Errorf("invalid Codex event on line %d: %w", lineNum, err)
		}
		sess.Events = append(sess.Events, events...)
	}

	if err := scanner.Err(); err != nil {
		return nil, fmt.Errorf("error reading file: %w", err)
	}
	if len(sess.Events) == 0 {
		return nil, fmt.Errorf("no supported Codex events found in session")
	}

	sess.StartedAt = sess.Events[0].Timestamp

	return sess, nil
}

func parseCodexSessionMeta(line codexLine, sess *Session) error {
	if len(line.Payload) == 0 {
		return fmt.Errorf("session metadata payload is empty")
	}

	var meta codexSessionMeta
	if err := json.Unmarshal(line.Payload, &meta); err != nil {
		return err
	}

	if sess.ID == "" && meta.ID != "" {
		sess.ID = meta.ID
	}
	if sess.CWD == "" && meta.CWD != "" {
		sess.CWD = meta.CWD
	}
	if sess.Model == "" && meta.Model != "" {
		sess.Model = meta.Model
	}
	if sess.StartedAt.IsZero() && meta.Timestamp != "" {
		ts, err := parseTimestampStrict(meta.Timestamp)
		if err != nil {
			return err
		}
		sess.StartedAt = ts
	}

	return nil
}

func parseCodexMessage(role string, rawContent json.RawMessage, ts time.Time) ([]TimelineEvent, error) {
	if len(rawContent) == 0 {
		return nil, fmt.Errorf("message content is empty")
	}

	var blocks []codexContentBlock
	if err := json.Unmarshal(rawContent, &blocks); err != nil {
		return nil, fmt.Errorf("unsupported message content format")
	}

	events := make([]TimelineEvent, 0, len(blocks))
	for _, block := range blocks {
		switch block.Type {
		case "input_text":
			if block.Text == "" {
				continue
			}
			eventType, eventRole := userFacingRole(role)
			events = append(events, TimelineEvent{
				Timestamp: ts,
				Type:      eventType,
				Role:      eventRole,
				Summary:   truncate(firstLine(block.Text), 100),
				Content:   block.Text,
			})

		case "output_text", "text":
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

		case "tool_call":
			input := rawMessageAsString(block.Arguments)
			events = append(events, TimelineEvent{
				Timestamp: ts,
				Type:      "tool_call",
				Role:      "assistant",
				Summary:   fmt.Sprintf("Tool: %s", block.Name),
				Content:   input,
				ToolName:  block.Name,
				ToolInput: input,
			})

		case "tool_result":
			events = append(events, TimelineEvent{
				Timestamp:  ts,
				Type:       "tool_result",
				Role:       "user",
				Summary:    fmt.Sprintf("Result: %s", truncate(firstLine(block.Output), 80)),
				Content:    block.Output,
				ToolResult: block.Output,
			})
		}
	}

	if len(events) == 0 {
		return nil, fmt.Errorf("message produced no supported events")
	}

	return events, nil
}

func parseCodexResponseItem(raw json.RawMessage, ts time.Time) ([]TimelineEvent, error) {
	if len(raw) == 0 {
		return nil, fmt.Errorf("response item payload is empty")
	}

	var item codexResponseItem
	if err := json.Unmarshal(raw, &item); err != nil {
		return nil, err
	}

	switch item.Type {
	case "message":
		return parseCodexMessage(item.Role, item.Content, ts)
	case "reasoning":
		event, err := parseCodexReasoning(item.Summary, ts)
		if err != nil {
			return nil, err
		}
		return []TimelineEvent{*event}, nil
	}

	if strings.HasSuffix(item.Type, "_call") {
		input := firstNonEmptyRawString(item.Input, item.Arguments, item.Action, item.Content)
		toolName := item.Name
		if toolName == "" {
			toolName = strings.TrimSuffix(item.Type, "_call")
		}
		return []TimelineEvent{{
			Timestamp: ts,
			Type:      "tool_call",
			Role:      "assistant",
			Summary:   fmt.Sprintf("Tool: %s", toolName),
			Content:   input,
			ToolName:  toolName,
			ToolInput: input,
		}}, nil
	}

	if strings.HasSuffix(item.Type, "_call_output") {
		output := item.Output
		if output == "" {
			output = rawMessageAsString(item.Content)
		}
		return []TimelineEvent{{
			Timestamp:  ts,
			Type:       "tool_result",
			Role:       "user",
			Summary:    fmt.Sprintf("Result: %s", truncate(firstLine(output), 80)),
			Content:    output,
			ToolResult: output,
		}}, nil
	}

	return nil, fmt.Errorf("unsupported response item type %q", item.Type)
}

func userFacingRole(role string) (eventType, eventRole string) {
	switch role {
	case "developer", "system":
		return "system", "system"
	default:
		return "user", "user"
	}
}

func parseCodexReasoning(rawSummary json.RawMessage, ts time.Time) (*TimelineEvent, error) {
	if len(rawSummary) == 0 {
		return nil, fmt.Errorf("reasoning summary is empty")
	}

	var summaryBlocks []codexSummaryBlock
	if err := json.Unmarshal(rawSummary, &summaryBlocks); err != nil {
		return nil, err
	}

	var summaryText strings.Builder
	for _, item := range summaryBlocks {
		if item.Type == "summary_text" {
			summaryText.WriteString(item.Text)
		}
	}

	return &TimelineEvent{
		Timestamp: ts,
		Type:      "thinking",
		Role:      "assistant",
		Summary:   "(thinking)",
		Content:   summaryText.String(),
	}, nil
}

func firstNonEmptyRawString(values ...json.RawMessage) string {
	for _, value := range values {
		if len(value) == 0 {
			continue
		}
		if rendered := rawMessageAsString(value); rendered != "" {
			return rendered
		}
	}
	return ""
}

func parseCodexMetadata(line codexLine, sess *Session) error {
	if line.ID != "" {
		sess.ID = line.ID
	}
	if line.Timestamp != "" {
		ts, err := parseTimestampStrict(line.Timestamp)
		if err != nil {
			return err
		}
		sess.StartedAt = ts
	}
	return nil
}
