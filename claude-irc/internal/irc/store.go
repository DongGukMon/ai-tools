package irc

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

const baseDir = ".claude-irc"

// Store manages the file-based storage for claude-irc.
type Store struct {
	BaseDir string // ~/.claude-irc/
	Name    string // current peer name (set after join)
}

// NewStore creates a Store at ~/.claude-irc/.
func NewStore() (*Store, error) {
	home, err := os.UserHomeDir()
	if err != nil {
		return nil, fmt.Errorf("failed to get home directory: %w", err)
	}

	dir := filepath.Join(home, baseDir)
	if err := os.MkdirAll(dir, 0755); err != nil {
		return nil, fmt.Errorf("failed to create store directory: %w", err)
	}

	return &Store{BaseDir: dir}, nil
}

// NewStoreWithBaseDir creates a Store with a custom base directory (used for testing).
func NewStoreWithBaseDir(dir string) (*Store, error) {
	if err := os.MkdirAll(dir, 0755); err != nil {
		return nil, fmt.Errorf("failed to create store directory: %w", err)
	}
	return &Store{BaseDir: dir}, nil
}

// Path helpers

func (s *Store) RegistryPath() string          { return filepath.Join(s.BaseDir, "registry.json") }
func (s *Store) LockPath() string              { return filepath.Join(s.BaseDir, "registry.lock") }
func (s *Store) SocketsDir() string            { return filepath.Join(s.BaseDir, "sockets") }
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

// DetectSession finds a session marker matching the given PPID.
func DetectSession(ppid int) (store *Store, name string, err error) {
	home, err := os.UserHomeDir()
	if err != nil {
		return nil, "", err
	}

	dir := filepath.Join(home, baseDir)
	markerPath := filepath.Join(dir, fmt.Sprintf(".session_%d", ppid))
	data, err := os.ReadFile(markerPath)
	if err != nil {
		return nil, "", fmt.Errorf("no active session for pid %d", ppid)
	}

	peerName := strings.TrimSpace(string(data))
	if peerName == "" {
		return nil, "", fmt.Errorf("no active session for pid %d", ppid)
	}

	return &Store{BaseDir: dir, Name: peerName}, peerName, nil
}
