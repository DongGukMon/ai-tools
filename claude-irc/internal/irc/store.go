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
	dir, err := ResolveStoreBaseDir()
	if err != nil {
		return nil, fmt.Errorf("failed to get store directory: %w", err)
	}
	if err := os.MkdirAll(dir, 0755); err != nil {
		return nil, fmt.Errorf("failed to create store directory: %w", err)
	}

	return &Store{BaseDir: dir}, nil
}

func ResolveStoreBaseDir() (string, error) {
	if override := strings.TrimSpace(os.Getenv("CLAUDE_IRC_HOME")); override != "" {
		return override, nil
	}
	home, err := os.UserHomeDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(home, baseDir), nil
}

// NewStoreWithBaseDir creates a Store with a custom base directory (used for testing).
func NewStoreWithBaseDir(dir string) (*Store, error) {
	if err := os.MkdirAll(dir, 0755); err != nil {
		return nil, fmt.Errorf("failed to create store directory: %w", err)
	}
	return &Store{BaseDir: dir}, nil
}
