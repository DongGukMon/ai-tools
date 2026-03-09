package whip

import (
	"fmt"
	"os/exec"
	"time"

	"github.com/google/uuid"
)

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
