package parser

import (
	"encoding/json"
	"os"
	"path/filepath"
	"sort"
	"time"
)

// SessionInfo is a lightweight summary of a session for listing purposes.
type SessionInfo struct {
	ID        string
	Backend   string // "claude" or "codex"
	Path      string
	StartedAt time.Time
	Model     string
	CWD       string
	FileSize  int64
}

// ListSessions discovers all sessions from both Claude and Codex backends.
func ListSessions() ([]SessionInfo, error) {
	homeDir, err := os.UserHomeDir()
	if err != nil {
		return nil, err
	}

	var sessions []SessionInfo
	sessions = append(sessions, listClaudeSessions(homeDir)...)
	sessions = append(sessions, listCodexSessions(homeDir)...)

	sort.Slice(sessions, func(i, j int) bool {
		return sessions[i].StartedAt.After(sessions[j].StartedAt)
	})
	return sessions, nil
}

// HasAnalysis checks if an analysis file exists for the given session ID.
func HasAnalysis(sessionID string) bool {
	homeDir, err := os.UserHomeDir()
	if err != nil {
		return false
	}
	p := filepath.Join(homeDir, ".rewind", "analysis", sessionID+".json")
	info, err := os.Stat(p)
	return err == nil && info.Mode().IsRegular()
}

func listClaudeSessions(homeDir string) []SessionInfo {
	projectsDir := filepath.Join(homeDir, ".claude", "projects")
	matches, err := filepath.Glob(filepath.Join(projectsDir, "*", "*.jsonl"))
	if err != nil {
		return nil
	}

	var sessions []SessionInfo
	for _, path := range matches {
		info, err := os.Stat(path)
		if err != nil || !info.Mode().IsRegular() {
			continue
		}
		base := filepath.Base(path)
		id := base[:len(base)-len(".jsonl")]
		// Skip subagent files
		if filepath.Base(filepath.Dir(path)) == "subagents" {
			continue
		}
		meta := peekClaudeMeta(path)
		meta.ID = id
		meta.Backend = "claude"
		meta.Path = path
		meta.FileSize = info.Size()
		if meta.StartedAt.IsZero() {
			meta.StartedAt = info.ModTime()
		}
		sessions = append(sessions, meta)
	}
	return sessions
}

func listCodexSessions(homeDir string) []SessionInfo {
	sessionsDir := filepath.Join(homeDir, ".codex", "sessions")
	matches, err := filepath.Glob(filepath.Join(sessionsDir, "*", "*", "*", "*.jsonl"))
	if err != nil {
		return nil
	}

	var sessions []SessionInfo
	for _, path := range matches {
		info, err := os.Stat(path)
		if err != nil || !info.Mode().IsRegular() {
			continue
		}
		base := filepath.Base(path)
		nameWithoutExt := base[:len(base)-len(".jsonl")]
		// Codex format: rollout-YYYY-MM-DDTHH-MM-SS-<session-id>.jsonl
		// Extract session ID: last segment after the timestamp prefix
		id := extractCodexID(nameWithoutExt)
		if id == "" {
			continue
		}
		meta := peekCodexMeta(path)
		meta.ID = id
		meta.Backend = "codex"
		meta.Path = path
		meta.FileSize = info.Size()
		if meta.StartedAt.IsZero() {
			meta.StartedAt = info.ModTime()
		}
		sessions = append(sessions, meta)
	}
	return sessions
}

// extractCodexID extracts the session UUID from a codex filename.
// Format: rollout-YYYY-MM-DDTHH-MM-SS-<uuid>
func extractCodexID(name string) string {
	// Find the UUID part: last 36 chars (8-4-4-4-12 format)
	if len(name) < 36 {
		return ""
	}
	candidate := name[len(name)-36:]
	// Validate UUID-like format (hex and hyphens)
	for i, r := range candidate {
		if i == 8 || i == 13 || i == 18 || i == 23 {
			if r != '-' {
				return ""
			}
		} else if !((r >= '0' && r <= '9') || (r >= 'a' && r <= 'f') || (r >= 'A' && r <= 'F')) {
			return ""
		}
	}
	return candidate
}

// peekClaudeMeta reads just enough of a Claude JSONL to extract metadata.
func peekClaudeMeta(path string) SessionInfo {
	var meta SessionInfo
	f, err := os.Open(path)
	if err != nil {
		return meta
	}
	defer f.Close()

	buf := make([]byte, 8192)
	n, _ := f.Read(buf)
	if n == 0 {
		return meta
	}
	// Find first complete line
	line := buf[:n]
	if idx := indexOf(line, '\n'); idx >= 0 {
		line = line[:idx]
	}
	var parsed struct {
		Timestamp string `json:"timestamp"`
		SessionID string `json:"sessionId"`
		CWD       string `json:"cwd"`
	}
	if json.Unmarshal(line, &parsed) == nil {
		meta.StartedAt = parseTimestamp(parsed.Timestamp)
		meta.CWD = parsed.CWD
	}
	return meta
}

// peekCodexMeta reads the session_meta line from a Codex JSONL.
func peekCodexMeta(path string) SessionInfo {
	var meta SessionInfo
	f, err := os.Open(path)
	if err != nil {
		return meta
	}
	defer f.Close()

	buf := make([]byte, 16384)
	n, _ := f.Read(buf)
	if n == 0 {
		return meta
	}
	// Scan lines for session_meta
	data := buf[:n]
	for len(data) > 0 {
		end := indexOf(data, '\n')
		var line []byte
		if end >= 0 {
			line = data[:end]
			data = data[end+1:]
		} else {
			line = data
			data = nil
		}
		var parsed struct {
			Type    string `json:"type"`
			Payload struct {
				ID        string `json:"id"`
				Timestamp string `json:"timestamp"`
				CWD       string `json:"cwd"`
				Model     string `json:"model"`
			} `json:"payload"`
		}
		if json.Unmarshal(line, &parsed) == nil && parsed.Type == "session_meta" {
			meta.StartedAt = parseTimestamp(parsed.Payload.Timestamp)
			meta.CWD = parsed.Payload.CWD
			meta.Model = parsed.Payload.Model
			break
		}
	}
	return meta
}

func indexOf(b []byte, c byte) int {
	for i, v := range b {
		if v == c {
			return i
		}
	}
	return -1
}
