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
		Events:  make([]TimelineEvent, 0, estimateEventCapacity(fileSize(f))),
	}

	scanner := bufio.NewScanner(f)
	scanner.Buffer(make([]byte, 0, 64*1024), 10*1024*1024)

	lineNum := 0
	for scanner.Scan() {
		lineBytes := scanner.Bytes()
		if len(lineBytes) == 0 {
			continue
		}
		lineNum++

		var line codexLine
		if err := json.Unmarshal(lineBytes, &line); err != nil {
			continue
		}

		if lineNum == 1 {
			parseCodexMetadata(line, sess)
			continue
		}

		if line.RecordType == "state" {
			continue
		}

		ts := parseTimestamp(line.Timestamp)

		switch line.Type {
		case "message":
			sess.Events = append(sess.Events, parseCodexMessage(line, ts)...)
		case "reasoning":
			if event := parseCodexReasoning(line, ts); event != nil {
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

func parseCodexMetadata(line codexLine, sess *Session) {
	if line.ID != "" {
		sess.ID = line.ID
	}
	if line.Timestamp != "" {
		sess.StartedAt = parseTimestamp(line.Timestamp)
	}
}

func parseCodexMessage(line codexLine, ts time.Time) []TimelineEvent {
	if len(line.Content) == 0 {
		return nil
	}

	var blocks []codexContentBlock
	if err := json.Unmarshal(line.Content, &blocks); err != nil {
		return nil
	}

	events := make([]TimelineEvent, 0, len(blocks))
	for _, block := range blocks {
		switch block.Type {
		case "input_text":
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

	return events
}

func parseCodexReasoning(line codexLine, ts time.Time) *TimelineEvent {
	if len(line.Summary) == 0 {
		return nil
	}

	var summaryBlocks []codexSummaryBlock
	if err := json.Unmarshal(line.Summary, &summaryBlocks); err != nil {
		return nil
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
	}
}
