package server

import (
	"bytes"
	"compress/gzip"
	"io"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/bang9/ai-tools/rewind/internal/parser"
)

func TestSessionPayloadWriteUsesGzipWhenAccepted(t *testing.T) {
	session := &parser.Session{
		ID:        "session",
		Backend:   "claude",
		StartedAt: time.Date(2026, 3, 11, 12, 0, 0, 0, time.UTC),
		Events: []parser.TimelineEvent{
			{
				Timestamp: time.Date(2026, 3, 11, 12, 0, 1, 0, time.UTC),
				Type:      "assistant",
				Role:      "assistant",
				Summary:   "summary",
				Content:   strings.Repeat("x", 4096),
			},
		},
	}

	payload, err := buildSessionPayload(session)
	if err != nil {
		t.Fatalf("buildSessionPayload returned error: %v", err)
	}
	if len(payload.gzipped) == 0 {
		t.Fatal("expected gzipped payload to be generated")
	}

	req := httptest.NewRequest("GET", "/api/session", nil)
	req.Header.Set("Accept-Encoding", "br, gzip")
	rec := httptest.NewRecorder()
	payload.write(rec, req)

	if rec.Header().Get("Content-Encoding") != "gzip" {
		t.Fatalf("expected gzip response, got %q", rec.Header().Get("Content-Encoding"))
	}

	zr, err := gzip.NewReader(bytes.NewReader(rec.Body.Bytes()))
	if err != nil {
		t.Fatalf("failed to open gzip reader: %v", err)
	}
	defer zr.Close()

	body, err := io.ReadAll(zr)
	if err != nil {
		t.Fatalf("failed to read gzip body: %v", err)
	}
	if !bytes.Equal(body, payload.plain) {
		t.Fatal("gzip body did not round-trip to plain payload")
	}
}
