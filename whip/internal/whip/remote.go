package whip

import (
	"bufio"
	"context"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"time"
)

const MasterSessionName = "whip-master"

const (
	whipHomeDirName      = "home"
	whipHomePromptFile   = "prompt.md"
	whipHomeMemoryFile   = "memory.md"
	whipHomeProjectsFile = "projects.md"
)

var spawnMasterTmuxSession = SpawnTmuxSession

// RemoteConfig holds settings for the whip remote command.
type RemoteConfig struct {
	Backend    string // "claude" or "codex"
	Difficulty string // "easy", "medium", "hard"
	Tunnel     string // cloudflare tunnel hostname (empty = no tunnel)
	Port       int    // serve port (default 8585)
	CWD        string // working directory for master session
}

type whipHomePaths struct {
	Dir      string
	Prompt   string
	Memory   string
	Projects string
}

func whipHomePathsFor(baseDir string) whipHomePaths {
	dir := filepath.Join(baseDir, whipHomeDirName)
	return whipHomePaths{
		Dir:      dir,
		Prompt:   filepath.Join(dir, whipHomePromptFile),
		Memory:   filepath.Join(dir, whipHomeMemoryFile),
		Projects: filepath.Join(dir, whipHomeProjectsFile),
	}
}

func ensureWhipHome(baseDir string) (whipHomePaths, error) {
	paths := whipHomePathsFor(baseDir)
	if err := os.MkdirAll(paths.Dir, 0755); err != nil {
		return whipHomePaths{}, fmt.Errorf("create whip home directory: %w", err)
	}

	seeds := map[string]string{
		paths.Prompt:   defaultMasterPrompt(),
		paths.Memory:   defaultWhipMemoryTemplate(),
		paths.Projects: defaultWhipProjectsTemplate(),
	}
	for path, content := range seeds {
		if err := seedFileIfMissing(path, content); err != nil {
			return whipHomePaths{}, err
		}
	}

	return paths, nil
}

func seedFileIfMissing(path string, content string) error {
	file, err := os.OpenFile(path, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0644)
	if err != nil {
		if os.IsExist(err) {
			return nil
		}
		return fmt.Errorf("seed %s: %w", path, err)
	}
	defer file.Close()

	if _, err := io.WriteString(file, content); err != nil {
		return fmt.Errorf("seed %s: %w", path, err)
	}
	return nil
}

func defaultMasterPrompt() string {
	return `You are the whip master session managing task agents.

## Getting Started
Run these commands to initialize your session:

1. Join the communication channel:
   claude-irc join whip-master

2. Enable periodic message check:
   /loop 1m claude-irc inbox

3. Read the home files before assigning work or replying:
   - WHIP_HOME/home/memory.md (default: ~/.whip/home/memory.md)
   - WHIP_HOME/home/projects.md (default: ~/.whip/home/projects.md)

4. Treat those files as reference context while coordinating agents, then wait for instructions from the dashboard operator.

## Home Directory
WHIP_HOME/home/ (default: ~/.whip/home/) persists across master sessions.

- prompt.md: This system prompt. Treat it as the source of truth for master-session behavior.
- memory.md: Durable user preferences, operational patterns, and judgment criteria. Read it first; only update it when the operator explicitly asks you to persist new guidance.
- projects.md: Project registry with paths, tech stacks, status, and notes. Read it first; only update it when the operator explicitly asks you to persist project metadata.

## Memory Management
- Default to read-only use.
- Only save durable context that will still matter in future sessions when the operator explicitly requests persistence.
- Prefer concrete user preferences, workflow expectations, review standards, environment quirks, and proven operating heuristics.
- Do not store secrets, access tokens, or one-off transient notes.
- If asked to update memory.md, edit it in place with concise changes instead of rewriting the whole file.

## Projects Management
- Default to read-only use.
- Keep projects.md factual and compact when updates are explicitly requested.
- Add or update rows only after the operator asks you to persist confirmed project metadata.
- Preserve existing information when possible; edit only the parts that changed.
- If details are uncertain, mark them as uncertain instead of guessing.

## Restrictions
NEVER use interactive or user-facing tools such as AskUserQuestion, webform, or any tool that requires user input via the terminal or browser. You are a background agent — all communication must go through claude-irc.
`
}

func defaultWhipMemoryTemplate() string {
	return `# Memory
## User Preferences

## Operational Patterns

## Judgment Criteria
`
}

func defaultWhipProjectsTemplate() string {
	return `# Projects
| Project | Path | Stack | Status | Notes |
|---------|------|-------|--------|-------|
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
		CWD:        cfg.CWD,
		Backend:    cfg.Backend,
	}

	baseDir, err := ResolveWhipBaseDir()
	if err != nil {
		return fmt.Errorf("cannot determine whip home directory: %w", err)
	}
	homePaths, err := ensureWhipHome(baseDir)
	if err != nil {
		return fmt.Errorf("ensure whip home: %w", err)
	}
	promptPath := homePaths.Prompt

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

	return spawnMasterTmuxSession(MasterSessionName, shellCmd)
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
