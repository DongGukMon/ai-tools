package parser

import (
	"encoding/json"
	"os"
	"strings"
	"time"
)

func estimateEventCapacity(fileSize int64) int {
	if fileSize <= 0 {
		return 256
	}

	estimate := int(fileSize / 768)
	if estimate < 256 {
		return 256
	}
	if estimate > 32768 {
		return 32768
	}
	return estimate
}

func fileSize(f *os.File) int64 {
	info, err := f.Stat()
	if err != nil {
		return 0
	}
	return info.Size()
}

func parseTimestamp(value string) time.Time {
	if value == "" {
		return time.Time{}
	}
	ts, _ := time.Parse(time.RFC3339Nano, value)
	return ts
}

func rawMessageAsString(raw json.RawMessage) string {
	if len(raw) == 0 {
		return ""
	}
	var text string
	if err := json.Unmarshal(raw, &text); err == nil {
		return text
	}
	return string(raw)
}

func firstLine(s string) string {
	s = strings.TrimSpace(s)
	if idx := strings.IndexByte(s, '\n'); idx >= 0 {
		return s[:idx]
	}
	return s
}
