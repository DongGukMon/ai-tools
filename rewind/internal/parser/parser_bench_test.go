package parser

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func BenchmarkParseClaude(b *testing.B) {
	for _, tc := range benchmarkCases() {
		b.Run(tc.name, func(b *testing.B) {
			path, size := writeClaudeBenchmarkFixture(b, tc.events, tc.payloadBytes)
			b.ReportAllocs()
			b.SetBytes(size)
			b.ResetTimer()

			for i := 0; i < b.N; i++ {
				session, err := ParseClaude(path)
				if err != nil {
					b.Fatalf("ParseClaude returned error: %v", err)
				}
				if len(session.Events) == 0 {
					b.Fatal("expected events to be parsed")
				}
			}
		})
	}
}

func BenchmarkParseCodex(b *testing.B) {
	for _, tc := range benchmarkCases() {
		b.Run(tc.name, func(b *testing.B) {
			path, size := writeCodexBenchmarkFixture(b, tc.events, tc.payloadBytes)
			b.ReportAllocs()
			b.SetBytes(size)
			b.ResetTimer()

			for i := 0; i < b.N; i++ {
				session, err := ParseCodex(path)
				if err != nil {
					b.Fatalf("ParseCodex returned error: %v", err)
				}
				if len(session.Events) == 0 {
					b.Fatal("expected events to be parsed")
				}
			}
		})
	}
}

type benchmarkCase struct {
	name         string
	events       int
	payloadBytes int
}

func benchmarkCases() []benchmarkCase {
	return []benchmarkCase{
		{name: "small-100", events: 100, payloadBytes: 256},
		{name: "medium-500", events: 500, payloadBytes: 768},
		{name: "large-2200", events: 2200, payloadBytes: 4096},
	}
}

func writeClaudeBenchmarkFixture(b *testing.B, events, payloadBytes int) (string, int64) {
	b.Helper()

	path := filepath.Join(b.TempDir(), "claude.jsonl")
	f, err := os.Create(path)
	if err != nil {
		b.Fatalf("failed to create fixture: %v", err)
	}
	defer f.Close()

	base := time.Date(2026, 3, 11, 12, 0, 0, 0, time.UTC)
	for i := 0; i < events; i++ {
		ts := base.Add(time.Duration(i) * time.Second).Format(time.RFC3339Nano)
		payload := benchmarkText("claude", i, payloadBytes)

		var line string
		switch {
		case i == 0:
			line = fmt.Sprintf(
				"{\"type\":\"user\",\"timestamp\":%q,\"sessionId\":\"claude-bench\",\"cwd\":\"/tmp/bench\",\"message\":{\"content\":[{\"type\":\"text\",\"text\":%q}]}}\n",
				ts, payload,
			)
		case i%10 == 0:
			line = fmt.Sprintf(
				"{\"type\":\"assistant\",\"timestamp\":%q,\"message\":{\"model\":\"claude-sonnet-4\",\"content\":[{\"type\":\"thinking\",\"thinking\":%q},{\"type\":\"tool_use\",\"name\":\"exec\",\"input\":{\"cmd\":\"echo %d\"}},{\"type\":\"text\",\"text\":%q}]}}\n",
				ts, payload, i, payload,
			)
		case i%10 == 1:
			line = fmt.Sprintf(
				"{\"type\":\"user\",\"timestamp\":%q,\"toolUseResult\":{\"file\":{\"content\":%q}},\"message\":{\"content\":[{\"type\":\"tool_result\",\"content\":%q}]}}\n",
				ts, payload, payload[:min(64, len(payload))],
			)
		default:
			line = fmt.Sprintf(
				"{\"type\":\"assistant\",\"timestamp\":%q,\"message\":{\"model\":\"claude-sonnet-4\",\"content\":[{\"type\":\"text\",\"text\":%q}]}}\n",
				ts, payload,
			)
		}

		if _, err := f.WriteString(line); err != nil {
			b.Fatalf("failed to write fixture: %v", err)
		}
	}

	info, err := f.Stat()
	if err != nil {
		b.Fatalf("failed to stat fixture: %v", err)
	}
	return path, info.Size()
}

func writeCodexBenchmarkFixture(b *testing.B, events, payloadBytes int) (string, int64) {
	b.Helper()

	path := filepath.Join(b.TempDir(), "codex.jsonl")
	f, err := os.Create(path)
	if err != nil {
		b.Fatalf("failed to create fixture: %v", err)
	}
	defer f.Close()

	base := time.Date(2026, 3, 11, 13, 0, 0, 0, time.UTC)
	if _, err := fmt.Fprintf(f, "{\"id\":\"codex-bench\",\"timestamp\":%q}\n", base.Format(time.RFC3339Nano)); err != nil {
		b.Fatalf("failed to write metadata: %v", err)
	}

	for i := 0; i < events; i++ {
		ts := base.Add(time.Duration(i+1) * time.Second).Format(time.RFC3339Nano)
		payload := benchmarkText("codex", i, payloadBytes)

		var line string
		switch {
		case i%12 == 0:
			line = fmt.Sprintf(
				"{\"type\":\"reasoning\",\"timestamp\":%q,\"summary\":[{\"type\":\"summary_text\",\"text\":%q}]}\n",
				ts, payload,
			)
		case i%12 == 1:
			line = fmt.Sprintf(
				"{\"type\":\"message\",\"timestamp\":%q,\"role\":\"assistant\",\"content\":[{\"type\":\"tool_call\",\"name\":\"search\",\"arguments\":{\"q\":%q}},{\"type\":\"tool_result\",\"output\":%q},{\"type\":\"output_text\",\"text\":%q}]}\n",
				ts, payload[:min(96, len(payload))], payload, payload,
			)
		default:
			role := "assistant"
			blockType := "output_text"
			if i%2 == 0 {
				role = "user"
				blockType = "input_text"
			}
			line = fmt.Sprintf(
				"{\"type\":\"message\",\"timestamp\":%q,\"role\":%q,\"content\":[{\"type\":%q,\"text\":%q}]}\n",
				ts, role, blockType, payload,
			)
		}

		if _, err := f.WriteString(line); err != nil {
			b.Fatalf("failed to write fixture: %v", err)
		}
	}

	info, err := f.Stat()
	if err != nil {
		b.Fatalf("failed to stat fixture: %v", err)
	}
	return path, info.Size()
}

func benchmarkText(prefix string, index, size int) string {
	head := fmt.Sprintf("%s-%d:", prefix, index)
	if len(head) >= size {
		return head
	}
	return head + strings.Repeat("x", size-len(head))
}

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}
