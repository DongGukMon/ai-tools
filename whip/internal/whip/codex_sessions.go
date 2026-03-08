package whip

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"
)

type codexSessionMetaLine struct {
	Type    string `json:"type"`
	Payload struct {
		ID  string `json:"id"`
		CWD string `json:"cwd"`
	} `json:"payload"`
}

type codexSessionCandidate struct {
	id       string
	cwd      string
	path     string
	modTime  time.Time
	contains bool
}

func waitForCodexSession(cwd, promptPath string, launchedAt time.Time, timeout time.Duration) (string, error) {
	deadline := time.Now().Add(timeout)
	var lastErr error
	for time.Now().Before(deadline) {
		id, err := findCodexSession(codexSessionsDir(), cwd, promptPath, launchedAt)
		if err == nil {
			return id, nil
		}
		lastErr = err
		time.Sleep(250 * time.Millisecond)
	}
	if lastErr == nil {
		lastErr = fmt.Errorf("timed out waiting for Codex session")
	}
	return "", lastErr
}

func codexSessionsDir() string {
	if home := os.Getenv("CODEX_HOME"); home != "" {
		return filepath.Join(home, "sessions")
	}
	home, err := os.UserHomeDir()
	if err != nil {
		return ""
	}
	return filepath.Join(home, ".codex", "sessions")
}

func findCodexSession(sessionsDir, cwd, promptPath string, launchedAt time.Time) (string, error) {
	if sessionsDir == "" {
		return "", fmt.Errorf("codex sessions directory is unavailable")
	}
	cwd = canonicalizeSessionPath(cwd)

	candidates, err := codexSessionCandidates(sessionsDir, promptPath, launchedAt)
	if err != nil {
		return "", err
	}
	if len(candidates) == 0 {
		return "", fmt.Errorf("no recent Codex sessions found")
	}

	for _, candidate := range candidates {
		if canonicalizeSessionPath(candidate.cwd) != cwd {
			continue
		}
		if candidate.contains {
			return candidate.id, nil
		}
	}
	return "", fmt.Errorf("no matching Codex session found for %s", promptPath)
}

func canonicalizeSessionPath(path string) string {
	if path == "" {
		return ""
	}
	if real, err := filepath.EvalSymlinks(path); err == nil {
		path = real
	}
	if abs, err := filepath.Abs(path); err == nil {
		path = abs
	}
	return filepath.Clean(path)
}

func codexSessionCandidates(sessionsDir, promptPath string, launchedAt time.Time) ([]codexSessionCandidate, error) {
	cutoff := launchedAt.Add(-2 * time.Second)
	var candidates []codexSessionCandidate

	err := filepath.WalkDir(sessionsDir, func(path string, d os.DirEntry, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		if d.IsDir() || filepath.Ext(path) != ".jsonl" {
			return nil
		}

		info, err := d.Info()
		if err != nil {
			return nil
		}
		if info.ModTime().Before(cutoff) {
			return nil
		}

		candidate, ok := readCodexSessionCandidate(path, promptPath, info.ModTime())
		if ok {
			candidates = append(candidates, candidate)
		}
		return nil
	})
	if err != nil {
		return nil, err
	}

	sort.Slice(candidates, func(i, j int) bool {
		return candidates[i].modTime.After(candidates[j].modTime)
	})

	return candidates, nil
}

func readCodexSessionCandidate(path, promptPath string, modTime time.Time) (codexSessionCandidate, bool) {
	data, err := os.ReadFile(path)
	if err != nil {
		return codexSessionCandidate{}, false
	}

	lineEnd := strings.IndexByte(string(data), '\n')
	if lineEnd == -1 {
		lineEnd = len(data)
	}

	var meta codexSessionMetaLine
	if err := json.Unmarshal(data[:lineEnd], &meta); err != nil {
		return codexSessionCandidate{}, false
	}
	if meta.Type != "session_meta" || meta.Payload.ID == "" {
		return codexSessionCandidate{}, false
	}

	return codexSessionCandidate{
		id:       meta.Payload.ID,
		cwd:      meta.Payload.CWD,
		path:     path,
		modTime:  modTime,
		contains: strings.Contains(string(data), promptPath),
	}, true
}
