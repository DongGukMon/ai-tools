package whip

import (
	"fmt"
	"os/exec"
	"strings"
	"time"

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

func (b *ClaudeBackend) SyncSession(task *Task, promptPath string, launchedAt time.Time) error {
	return nil
}

// prepareSessionFlag sets up the Claude session flag for a task spawn.
// If the task has no SessionID, generates a new one and returns --session-id.
// If the task already has a SessionID (retry), forks from the previous
// conversation into a fresh session ID for the new run.
func (b *ClaudeBackend) prepareSessionFlag(task *Task) string {
	if task.SessionID != "" {
		oldID := task.SessionID
		task.SessionID = uuid.New().String()
		return fmt.Sprintf(
			"--resume %s --fork-session --session-id %s",
			shellEscape(oldID),
			shellEscape(task.SessionID),
		)
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

// CodexBackend implements SessionBackend for the Codex CLI.
type CodexBackend struct{}

func (b *CodexBackend) Name() string { return "codex" }

func (b *CodexBackend) GeneratePrompt(task *Task) string {
	return generateCodexPrompt(task)
}

func (b *CodexBackend) BuildLaunchCmd(task *Task, promptPath string) string {
	args := append([]string{"codex"}, b.commonArgs(task)...)
	prompt := codexPromptArg(promptPath)
	if task.SessionID != "" {
		args = append(args, "fork", task.SessionID, prompt)
	} else {
		args = append(args, prompt)
	}
	return shellJoin(args)
}

func (b *CodexBackend) BuildResumeCmd(task *Task) string {
	args := append([]string{"codex"}, b.commonArgs(task)...)
	args = append(args, "resume", task.SessionID)
	return shellJoin(args)
}

func (b *CodexBackend) ResumeExec(task *Task) (string, []string, error) {
	codexPath, err := exec.LookPath("codex")
	if err != nil {
		return "", nil, fmt.Errorf("codex not found: %w", err)
	}
	args := append([]string{"codex"}, b.commonArgs(task)...)
	args = append(args, "resume", task.SessionID)
	return codexPath, args, nil
}

func (b *CodexBackend) SyncSession(task *Task, promptPath string, launchedAt time.Time) error {
	id, err := waitForCodexSession(task.CWD, promptPath, launchedAt, 8*time.Second)
	if err != nil {
		return err
	}
	task.SessionID = id
	return nil
}

func (b *CodexBackend) commonArgs(task *Task) []string {
	args := []string{
		"--dangerously-bypass-approvals-and-sandbox",
		"--no-alt-screen",
	}

	model, effort := b.modelConfig(task)
	if model != "" {
		args = append(args, "-m", model)
	}
	if effort != "" {
		args = append(args, "-c", fmt.Sprintf("model_reasoning_effort=%q", effort))
	}

	return args
}

func (b *CodexBackend) modelConfig(task *Task) (model string, effort string) {
	model = "gpt-5.4"
	switch task.Difficulty {
	case "hard":
		return model, "xhigh"
	case "medium":
		return model, "xhigh"
	case "easy":
		return model, "high"
	default:
		return model, "xhigh"
	}
}

func codexPromptArg(promptPath string) string {
	return fmt.Sprintf("Read and follow %s", promptPath)
}

func shellJoin(args []string) string {
	quoted := make([]string, 0, len(args))
	for _, arg := range args {
		if strings.TrimSpace(arg) == "" {
			continue
		}
		quoted = append(quoted, shellEscape(arg))
	}
	return strings.Join(quoted, " ")
}
