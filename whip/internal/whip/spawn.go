package whip

import (
	"fmt"
	"os/exec"
	"strings"
	"time"
)

func Spawn(task *Task, promptPath string) (string, error) {
	backend, err := GetBackend(task.Backend)
	if err != nil {
		return "", err
	}

	if err := backend.PrepareSession(task); err != nil {
		return "", fmt.Errorf("prepare session: %w", err)
	}

	launchCmd := backend.BuildLaunchCmd(task, promptPath)
	launchedAt := time.Now()
	shellCmd := fmt.Sprintf(
		`cd %s && WHIP_SHELL_PID=$$ WHIP_TASK_ID=%s %s ; exit`,
		shellEscape(task.CWD),
		shellEscape(task.ID),
		launchCmd,
	)

	if _, err := exec.LookPath("tmux"); err == nil {
		if err := SpawnTmux(task.ID, shellCmd); err != nil {
			return "", fmt.Errorf("tmux spawn failed: %w", err)
		}
		if err := backend.SyncSession(task, promptPath, launchedAt); err != nil {
			return "", fmt.Errorf("session tracking failed: %w", err)
		}
		return "tmux", nil
	}

	if err := SpawnTerminal(task.ID, shellCmd); err != nil {
		return "", fmt.Errorf("terminal spawn failed: %w", err)
	}
	if err := backend.SyncSession(task, promptPath, launchedAt); err != nil {
		return "", fmt.Errorf("session tracking failed: %w", err)
	}
	return "terminal", nil
}

func currentTime() (t time.Time) {
	return time.Now()
}

func shellEscape(s string) string {
	return "'" + strings.ReplaceAll(s, "'", "'\"'\"'") + "'"
}

func appleScriptString(s string) string {
	escaped := strings.ReplaceAll(s, `\`, `\\`)
	escaped = strings.ReplaceAll(escaped, `"`, `\"`)
	return `"` + escaped + `"`
}
