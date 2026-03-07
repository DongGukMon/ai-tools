package whip

import (
	"fmt"
	"os/exec"

	"github.com/google/uuid"
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
	default:
		return nil, fmt.Errorf("unknown backend: %s", name)
	}
}

// ClaudeBackend implements SessionBackend for Claude Code.
type ClaudeBackend struct{}

func (b *ClaudeBackend) Name() string { return "claude" }

func (b *ClaudeBackend) GeneratePrompt(task *Task) string {
	return generateClaudePrompt(task)
}

func (b *ClaudeBackend) BuildLaunchCmd(task *Task, promptPath string) string {
	sessionFlag := b.prepareSessionFlag(task)
	modelFlags := b.prepareModelFlags(task)

	flags := sessionFlag
	if modelFlags != "" {
		flags = modelFlags + " " + flags
	}

	return fmt.Sprintf(
		`claude --dangerously-skip-permissions %s "Read and follow %s"`,
		flags,
		shellEscape(promptPath),
	)
}

func (b *ClaudeBackend) BuildResumeCmd(task *Task) string {
	return fmt.Sprintf(`claude --resume %s`, shellEscape(task.SessionID))
}

func (b *ClaudeBackend) ResumeExec(task *Task) (string, []string, error) {
	claudePath, err := exec.LookPath("claude")
	if err != nil {
		return "", nil, fmt.Errorf("claude not found: %w", err)
	}
	return claudePath, []string{"claude", "--resume", task.SessionID}, nil
}

// prepareSessionFlag sets up the Claude session flag for a task spawn.
// If the task has no SessionID, generates a new one and returns --session-id.
// If the task already has a SessionID (retry), returns --resume to fork from
// the previous conversation, and updates SessionID to a new UUID for this run.
func (b *ClaudeBackend) prepareSessionFlag(task *Task) string {
	if task.SessionID != "" {
		oldID := task.SessionID
		task.SessionID = uuid.New().String()
		return "--resume " + shellEscape(oldID)
	}
	task.SessionID = uuid.New().String()
	return "--session-id " + shellEscape(task.SessionID)
}

// prepareModelFlags returns CLI flags for claude based on task difficulty.
func (b *ClaudeBackend) prepareModelFlags(task *Task) string {
	switch task.Difficulty {
	case "hard":
		return "--model opus --effort high"
	case "medium":
		return "--model opus --effort medium"
	case "easy":
		return "--model sonnet"
	default:
		return ""
	}
}
