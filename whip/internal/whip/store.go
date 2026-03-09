package whip

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

const (
	whipDir      = ".whip"
	configFile   = "config.json"
	configLock   = "config.lock"
	tasksDir     = "tasks"
	taskFile     = "task.json"
	taskLockFile = "task.lock"
	promptFile   = "prompt.txt"
)

type Config struct {
	MasterIRCName string `json:"master_irc_name"`
	Tunnel        string `json:"tunnel,omitempty"`
	RemotePort    int    `json:"remote_port,omitempty"`
	ServeToken    string `json:"serve_token,omitempty"`
}

type Store struct {
	BaseDir string
}

func NewStore() (*Store, error) {
	baseDir, err := ResolveWhipBaseDir()
	if err != nil {
		return nil, fmt.Errorf("cannot determine home directory: %w", err)
	}
	if err := os.MkdirAll(filepath.Join(baseDir, tasksDir), 0755); err != nil {
		return nil, fmt.Errorf("cannot create whip directory: %w", err)
	}
	return &Store{BaseDir: baseDir}, nil
}

func ResolveWhipBaseDir() (string, error) {
	if override := strings.TrimSpace(os.Getenv("WHIP_HOME")); override != "" {
		return override, nil
	}
	home, err := os.UserHomeDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(home, whipDir), nil
}
