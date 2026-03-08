package whip

import (
	"bufio"
	"context"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
)

const MasterSessionName = "whip-master"

// RemoteConfig holds settings for the whip remote command.
type RemoteConfig struct {
	Backend    string // "claude" or "codex"
	Difficulty string // "easy", "medium", "hard"
	Tunnel     string // cloudflare tunnel hostname (empty = no tunnel)
	Port       int    // serve port (default 8585)
	CWD        string // working directory for master session
}

// GenerateMasterPrompt returns the prompt content for the master session.
func GenerateMasterPrompt(cfg RemoteConfig) string {
	return `You are the whip master session managing task agents.

## Getting Started
Run this command to join the IRC channel:
   claude-irc join whip-master

Then wait for instructions from the dashboard operator.
`
}

// SpawnMasterSession creates a detached tmux session running the AI backend
// as the whip master, following the same pattern as Spawn() in spawn.go.
func SpawnMasterSession(cfg RemoteConfig) error {
	backend, err := GetBackend(cfg.Backend)
	if err != nil {
		return fmt.Errorf("get backend: %w", err)
	}

	// Create a temporary Task object for BuildLaunchCmd
	task := &Task{
		Difficulty: cfg.Difficulty,
		CWD:       cfg.CWD,
		Backend:   cfg.Backend,
	}

	// Write prompt to ~/.whip/master-prompt.txt
	home, err := os.UserHomeDir()
	if err != nil {
		return fmt.Errorf("cannot determine home directory: %w", err)
	}
	promptPath := filepath.Join(home, whipDir, "master-prompt.txt")
	prompt := GenerateMasterPrompt(cfg)
	if err := os.WriteFile(promptPath, []byte(prompt), 0644); err != nil {
		return fmt.Errorf("write master prompt: %w", err)
	}

	launchCmd := backend.BuildLaunchCmd(task, promptPath)

	cwd := cfg.CWD
	if cwd == "" {
		cwd, _ = os.Getwd()
	}

	shellCmd := fmt.Sprintf(
		`cd %s && %s ; exit`,
		shellEscape(cwd),
		launchCmd,
	)

	return SpawnTmuxSession(MasterSessionName, shellCmd)
}

// IsMasterSessionAlive checks if the whip-master tmux session exists.
func IsMasterSessionAlive() bool {
	return IsTmuxSessionName(MasterSessionName)
}

// StopMasterSession kills the whip-master tmux session.
func StopMasterSession() error {
	return KillTmuxSessionName(MasterSessionName)
}

// StartServe starts `claude-irc serve` as a subprocess and returns the
// process handle, the parsed connect URL, and any error.
func StartServe(ctx context.Context, cfg RemoteConfig) (*exec.Cmd, string, error) {
	args := []string{"serve", "--port", strconv.Itoa(cfg.Port), "--master-tmux", MasterSessionName}
	if cfg.Tunnel != "" {
		args = append(args, "--tunnel", cfg.Tunnel)
	}

	cmd := exec.CommandContext(ctx, "claude-irc", args...)
	cmd.Stdout = os.Stdout

	stderrPipe, err := cmd.StderrPipe()
	if err != nil {
		return nil, "", fmt.Errorf("stderr pipe: %w", err)
	}

	if err := cmd.Start(); err != nil {
		return nil, "", fmt.Errorf("start claude-irc serve: %w", err)
	}

	// Parse connect URL from stderr output
	connectURL := ""
	scanner := bufio.NewScanner(stderrPipe)
	for scanner.Scan() {
		line := scanner.Text()
		fmt.Fprintln(os.Stderr, line)
		if strings.Contains(line, "Connect URL:") {
			parts := strings.SplitN(line, "Connect URL:", 2)
			if len(parts) == 2 {
				connectURL = strings.TrimSpace(parts[1])
				break
			}
		}
		// Also check for listen address as fallback
		if strings.Contains(line, "listening on") || strings.Contains(line, "Listening on") {
			parts := strings.SplitN(line, "on ", 2)
			if len(parts) == 2 && connectURL == "" {
				connectURL = strings.TrimSpace(parts[1])
			}
		}
	}

	// Drain remaining stderr in background
	go func() {
		for scanner.Scan() {
			fmt.Fprintln(os.Stderr, scanner.Text())
		}
	}()

	return cmd, connectURL, nil
}
