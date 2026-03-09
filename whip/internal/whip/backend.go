package whip

import (
	"fmt"
	"time"
)

// DefaultBackendName is the fallback backend when none is specified on a task.
const DefaultBackendName = "claude"

// SessionBackend abstracts the AI backend used to run task sessions.
type SessionBackend interface {
	// Name returns the backend identifier persisted in task data.
	Name() string

	// GeneratePrompt returns the prompt content for the task.
	GeneratePrompt(task *Task) string

	// BuildLaunchCmd returns the backend command string for spawning a session.
	// The caller wraps it with cd, env vars, and exit.
	// May modify task fields (e.g., SessionID) for session tracking.
	BuildLaunchCmd(task *Task, promptPath string) string

	// BuildResumeCmd returns a shell command string to resume a session.
	// Used to spawn a resume session in tmux.
	BuildResumeCmd(task *Task) string

	// ResumeExec returns the binary path and args for syscall.Exec resume.
	// Used by the `resume` CLI command for interactive resume.
	ResumeExec(task *Task) (path string, args []string, err error)

	// SyncSession updates backend-specific session tracking after spawn.
	// Backends that can predeclare session IDs may return nil immediately.
	SyncSession(task *Task, promptPath string, launchedAt time.Time) error
}

// GetBackend returns the SessionBackend for the given name.
// Empty name defaults to "claude".
func GetBackend(name string) (SessionBackend, error) {
	if name == "" {
		name = DefaultBackendName
	}
	switch name {
	case "claude":
		return &ClaudeBackend{}, nil
	case "codex":
		return &CodexBackend{}, nil
	default:
		return nil, fmt.Errorf("unknown backend: %s", name)
	}
}
