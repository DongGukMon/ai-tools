package parser

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"
)

const maxSessionFileSize = 64 << 20

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

func validateSessionID(sessionID string) error {
	if sessionID == "" {
		return fmt.Errorf("session id is required")
	}
	if len(sessionID) > 255 {
		return fmt.Errorf("session id is too long")
	}
	if sessionID != filepath.Base(sessionID) || strings.Contains(sessionID, "..") || strings.ContainsAny(sessionID, `/\[]?*`) {
		return fmt.Errorf("session id contains unsupported path characters")
	}
	return nil
}

func parseTimestamp(value string) time.Time {
	if value == "" {
		return time.Time{}
	}
	ts, _ := time.Parse(time.RFC3339Nano, value)
	return ts
}

func parseTimestampStrict(value string) (time.Time, error) {
	if value == "" {
		return time.Time{}, fmt.Errorf("timestamp is required")
	}
	ts, err := time.Parse(time.RFC3339Nano, value)
	if err != nil {
		return time.Time{}, fmt.Errorf("invalid timestamp %q", value)
	}
	return ts, nil
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

// ResolveSessionPath canonicalizes a user-provided session path and limits it to
// regular .jsonl files to avoid serving arbitrary special files or following symlinks.
func ResolveSessionPath(path string) (string, error) {
	if path == "" {
		return "", fmt.Errorf("session path is required")
	}

	cleaned := filepath.Clean(path)
	absPath, err := filepath.Abs(cleaned)
	if err != nil {
		return "", fmt.Errorf("failed to resolve session path: %w", err)
	}

	linkInfo, err := os.Lstat(absPath)
	if err != nil {
		return "", fmt.Errorf("failed to stat session path: %w", err)
	}
	if linkInfo.Mode()&os.ModeSymlink != 0 {
		return "", fmt.Errorf("session path must not be a symlink: %s", absPath)
	}

	resolvedPath, err := filepath.EvalSymlinks(absPath)
	if err != nil {
		return "", fmt.Errorf("failed to resolve session path: %w", err)
	}
	if !strings.EqualFold(filepath.Ext(resolvedPath), ".jsonl") {
		return "", fmt.Errorf("session path must point to a .jsonl file: %s", resolvedPath)
	}

	info, err := os.Stat(resolvedPath)
	if err != nil {
		return "", fmt.Errorf("failed to stat session path: %w", err)
	}
	if !info.Mode().IsRegular() {
		return "", fmt.Errorf("session path must point to a regular file: %s", resolvedPath)
	}
	if info.Size() > maxSessionFileSize {
		return "", fmt.Errorf("session file exceeds %d MiB limit: %s", maxSessionFileSize>>20, resolvedPath)
	}

	return resolvedPath, nil
}

func resolveDiscoveredSessionPath(rootDir, path string) (string, error) {
	resolvedPath, err := ResolveSessionPath(path)
	if err != nil {
		return "", err
	}

	rootAbs, err := filepath.Abs(filepath.Clean(rootDir))
	if err != nil {
		return "", fmt.Errorf("failed to resolve session root: %w", err)
	}
	resolvedRoot, err := filepath.EvalSymlinks(rootAbs)
	if err != nil {
		return "", fmt.Errorf("failed to resolve session root: %w", err)
	}

	rel, err := filepath.Rel(resolvedRoot, resolvedPath)
	if err != nil {
		return "", fmt.Errorf("failed to evaluate session root containment: %w", err)
	}
	if rel == ".." || strings.HasPrefix(rel, ".."+string(os.PathSeparator)) {
		return "", fmt.Errorf("session path escapes root %s: %s", resolvedRoot, resolvedPath)
	}

	return resolvedPath, nil
}
