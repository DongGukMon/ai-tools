package irc

import (
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
)

const baseDir = ".claude-irc"

// Store manages the file-based storage for claude-irc.
type Store struct {
	BaseDir string // ~/.claude-irc/<repo-id>/
	RepoID  string
	Name    string // current peer name (set after join)
}

// NewStore creates a Store scoped to the current git repo.
func NewStore() (*Store, error) {
	repoID, err := detectRepoID()
	if err != nil {
		return nil, err
	}
	return NewStoreWithRepoID(repoID)
}

// NewStoreWithRepoID creates a Store with a known repo ID (used by daemon).
func NewStoreWithRepoID(repoID string) (*Store, error) {
	home, err := os.UserHomeDir()
	if err != nil {
		return nil, fmt.Errorf("failed to get home directory: %w", err)
	}

	dir := filepath.Join(home, baseDir, repoID)
	if err := os.MkdirAll(dir, 0755); err != nil {
		return nil, fmt.Errorf("failed to create store directory: %w", err)
	}

	return &Store{BaseDir: dir, RepoID: repoID}, nil
}

// detectRepoID computes a stable ID for the current git repo.
// Prefers remote URL (same across clones), falls back to repo root path.
func detectRepoID() (string, error) {
	// Try git remote URL first
	out, err := exec.Command("git", "remote", "get-url", "origin").Output()
	if err == nil {
		remote := strings.TrimSpace(string(out))
		if remote != "" {
			return hashID(remote), nil
		}
	}

	// Fallback to repo root absolute path
	out, err = exec.Command("git", "rev-parse", "--show-toplevel").Output()
	if err != nil {
		return "", fmt.Errorf("not in a git repository")
	}

	root := strings.TrimSpace(string(out))
	if root == "" {
		return "", fmt.Errorf("empty git root path")
	}
	return hashID(root), nil
}

func hashID(s string) string {
	h := sha256.Sum256([]byte(s))
	return hex.EncodeToString(h[:8])
}

// Path helpers

func (s *Store) RegistryPath() string     { return filepath.Join(s.BaseDir, "registry.json") }
func (s *Store) LockPath() string         { return filepath.Join(s.BaseDir, "registry.lock") }
func (s *Store) SocketsDir() string       { return filepath.Join(s.BaseDir, "sockets") }
func (s *Store) SocketPath(name string) string { return filepath.Join(s.SocketsDir(), name+".sock") }
func (s *Store) PIDPath(name string) string    { return filepath.Join(s.SocketsDir(), name+".pid") }
func (s *Store) InboxDir(name string) string   { return filepath.Join(s.BaseDir, "inbox", name) }
func (s *Store) TopicsDir(name string) string  { return filepath.Join(s.BaseDir, "topics", name) }

// Session marker: allows check command to detect current session without running git.

func (s *Store) SessionMarkerPath(ppid int) string {
	return filepath.Join(s.BaseDir, fmt.Sprintf(".session_%d", ppid))
}

func (s *Store) WriteSessionMarker(name string, ppid int) error {
	return os.WriteFile(s.SessionMarkerPath(ppid), []byte(name), 0644)
}

func (s *Store) ReadSessionMarker(ppid int) (string, error) {
	data, err := os.ReadFile(s.SessionMarkerPath(ppid))
	if err != nil {
		return "", err
	}
	return strings.TrimSpace(string(data)), nil
}

func (s *Store) RemoveSessionMarker(ppid int) error {
	return os.Remove(s.SessionMarkerPath(ppid))
}

// DetectSession scans all claude-irc repo dirs for a session marker matching the given PPID.
// This avoids running git for the hook hot path.
func DetectSession(ppid int) (store *Store, name string, err error) {
	home, err := os.UserHomeDir()
	if err != nil {
		return nil, "", err
	}

	base := filepath.Join(home, baseDir)
	entries, err := os.ReadDir(base)
	if err != nil {
		return nil, "", err
	}

	markerName := fmt.Sprintf(".session_%d", ppid)
	for _, entry := range entries {
		if !entry.IsDir() {
			continue
		}
		markerPath := filepath.Join(base, entry.Name(), markerName)
		data, err := os.ReadFile(markerPath)
		if err != nil {
			continue
		}
		peerName := strings.TrimSpace(string(data))
		if peerName == "" {
			continue
		}
		s := &Store{
			BaseDir: filepath.Join(base, entry.Name()),
			RepoID:  entry.Name(),
			Name:    peerName,
		}
		return s, peerName, nil
	}

	return nil, "", fmt.Errorf("no active session for pid %d", ppid)
}
