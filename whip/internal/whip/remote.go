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
	"time"
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

// ServeResult holds the parsed output from claude-irc serve.
type ServeResult struct {
	ConnectURL string
	ShortURL   string
}

// StartServe starts `claude-irc serve` as a subprocess and returns the
// process handle, the parsed URLs, and any error.
// When silent is true, stdout/stderr are suppressed and stdin is detached (for TUI embedding).
func StartServe(ctx context.Context, cfg RemoteConfig, token string, silent bool) (*exec.Cmd, ServeResult, error) {
	args := []string{"serve", "--port", strconv.Itoa(cfg.Port), "--master-tmux", MasterSessionName}
	if cfg.Tunnel != "" {
		args = append(args, "--tunnel", cfg.Tunnel)
	}
	if token != "" {
		args = append(args, "--token", token)
	}

	cmd := exec.CommandContext(ctx, "claude-irc", args...)
	if silent {
		// Detach stdin so serve's keyboard loop won't interfere with TUI
		cmd.Stdin = nil
	} else {
		cmd.Stdout = os.Stdout
	}

	stderrPipe, err := cmd.StderrPipe()
	if err != nil {
		return nil, ServeResult{}, fmt.Errorf("stderr pipe: %w", err)
	}

	if err := cmd.Start(); err != nil {
		return nil, ServeResult{}, fmt.Errorf("start claude-irc serve: %w", err)
	}

	// Parse URLs from stderr with timeout
	var result ServeResult
	done := make(chan struct{})
	go func() {
		scanner := bufio.NewScanner(stderrPipe)
		got := 0
		for scanner.Scan() {
			line := scanner.Text()
			if !silent {
				fmt.Fprintln(os.Stderr, line)
			}
			if strings.Contains(line, "Connect URL:") {
				parts := strings.SplitN(line, "Connect URL:", 2)
				if len(parts) == 2 {
					result.ConnectURL = strings.TrimSpace(parts[1])
					got++
				}
			}
			if strings.Contains(line, "Short URL:") {
				parts := strings.SplitN(line, "Short URL:", 2)
				if len(parts) == 2 {
					result.ShortURL = strings.TrimSpace(parts[1])
					got++
				}
			}
			if got >= 2 {
				break
			}
		}
		// Drain remaining stderr in background
		go func() {
			for scanner.Scan() {
				if !silent {
					fmt.Fprintln(os.Stderr, scanner.Text())
				}
			}
		}()
		close(done)
	}()

	// Wait for URLs with timeout (tunnel setup can take a while)
	select {
	case <-done:
	case <-time.After(30 * time.Second):
	}

	return cmd, result, nil
}
