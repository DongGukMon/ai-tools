package whip

import (
	"fmt"
	"os"
	"os/exec"
	"strconv"
	"strings"
	"syscall"
	"time"

	"github.com/google/uuid"
)

// tmuxSessionName returns the tmux session name for a task.
func tmuxSessionName(taskID string) string {
	return "whip-" + taskID
}

// prepareSessionFlag sets up the Claude session flag for a task spawn.
// If the task has no SessionID, generates a new one and returns --session-id.
// If the task already has a SessionID (retry), returns --resume to fork from
// the previous conversation, and updates SessionID to a new UUID for this run.
func prepareSessionFlag(task *Task) string {
	if task.SessionID != "" {
		// Retry: resume from previous session, then track new session ID
		oldID := task.SessionID
		task.SessionID = uuid.New().String()
		return "--resume " + shellEscape(oldID)
	}
	// First spawn: generate new session ID
	task.SessionID = uuid.New().String()
	return "--session-id " + shellEscape(task.SessionID)
}

// prepareModelFlags returns CLI flags for claude based on task difficulty.
func prepareModelFlags(task *Task) string {
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

// SpawnTmux creates a detached tmux session running Claude Code for the task.
func SpawnTmux(task *Task, promptPath string) error {
	sessionFlag := prepareSessionFlag(task)
	modelFlags := prepareModelFlags(task)

	flags := sessionFlag
	if modelFlags != "" {
		flags = modelFlags + " " + flags
	}

	shellCmd := fmt.Sprintf(
		`cd %s && WHIP_SHELL_PID=$$ WHIP_TASK_ID=%s claude --dangerously-skip-permissions %s "Read and follow %s" ; exit`,
		shellEscape(task.CWD),
		shellEscape(task.ID),
		flags,
		shellEscape(promptPath),
	)

	cmd := exec.Command("tmux", "new-session", "-d",
		"-s", tmuxSessionName(task.ID),
		"-x", "120", "-y", "40",
		shellCmd,
	)
	cmd.Stdout = os.Stderr
	cmd.Stderr = os.Stderr
	return cmd.Run()
}

// Spawn tries tmux first, falls back to Terminal.app. Returns the runner type.
func Spawn(task *Task, promptPath string) (string, error) {
	if _, err := exec.LookPath("tmux"); err == nil {
		if err := SpawnTmux(task, promptPath); err != nil {
			return "", fmt.Errorf("tmux spawn failed: %w", err)
		}
		return "tmux", nil
	}

	if err := SpawnTerminal(task, promptPath); err != nil {
		return "", fmt.Errorf("terminal spawn failed: %w", err)
	}
	return "terminal", nil
}

// IsTmuxSession checks if a tmux session exists for the given task ID.
func IsTmuxSession(taskID string) bool {
	cmd := exec.Command("tmux", "has-session", "-t", tmuxSessionName(taskID))
	return cmd.Run() == nil
}

// KillTmuxSession kills the tmux session for the given task ID.
func KillTmuxSession(taskID string) error {
	cmd := exec.Command("tmux", "kill-session", "-t", tmuxSessionName(taskID))
	cmd.Stderr = os.Stderr
	return cmd.Run()
}

// AttachTmuxSession attaches to the tmux session for the given task ID.
// Runs as a subprocess so the caller resumes after tmux detach.
func AttachTmuxSession(taskID string) error {
	cmd := exec.Command("tmux", "attach", "-t", tmuxSessionName(taskID))
	cmd.Stdin = os.Stdin
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	return cmd.Run()
}

// CaptureTmuxPane captures the current pane content of a tmux session.
func CaptureTmuxPane(taskID string) (string, error) {
	cmd := exec.Command("tmux", "capture-pane", "-t", tmuxSessionName(taskID), "-p")
	out, err := cmd.Output()
	if err != nil {
		return "", err
	}
	return string(out), nil
}

// SpawnTerminal opens a new Terminal.app tab via osascript and runs Claude Code
// with the task's prompt file. The env vars WHIP_SHELL_PID and WHIP_TASK_ID
// are set so the task session can register itself via heartbeat.
func SpawnTerminal(task *Task, promptPath string) error {
	// Build the shell command to execute in the new terminal.
	// $$ evaluates to the shell PID of the new terminal tab.
	// ; exit ensures the terminal tab closes when Claude exits.
	sessionFlag := prepareSessionFlag(task)
	modelFlags := prepareModelFlags(task)

	flags := sessionFlag
	if modelFlags != "" {
		flags = modelFlags + " " + flags
	}

	shellCmd := fmt.Sprintf(
		`cd %s && WHIP_SHELL_PID=$$ WHIP_TASK_ID=%s claude --dangerously-skip-permissions %s "Read and follow %s" ; exit`,
		shellEscape(task.CWD),
		shellEscape(task.ID),
		flags,
		shellEscape(promptPath),
	)

	script := fmt.Sprintf(
		`tell application "Terminal" to do script %s`,
		appleScriptString(shellCmd),
	)

	cmd := exec.Command("osascript", "-e", script)
	cmd.Stdout = os.Stderr
	cmd.Stderr = os.Stderr
	return cmd.Run()
}

// SpawnDashboard opens a new Terminal.app tab running whip dashboard.
func SpawnDashboard() error {
	script := fmt.Sprintf(
		`tell application "Terminal" to do script %s`,
		appleScriptString("whip dashboard"),
	)
	cmd := exec.Command("osascript", "-e", script)
	cmd.Stdout = os.Stderr
	cmd.Stderr = os.Stderr
	return cmd.Run()
}

// IsProcessAlive checks if a process with the given PID is still running.
func IsProcessAlive(pid int) bool {
	if pid <= 0 {
		return false
	}
	proc, err := os.FindProcess(pid)
	if err != nil {
		return false
	}
	// Signal 0 checks existence without actually sending a signal.
	err = proc.Signal(syscall.Signal(0))
	return err == nil
}

// KillProcess sends SIGTERM to the process group, then SIGKILL if needed.
func KillProcess(pid int) error {
	if pid <= 0 {
		return fmt.Errorf("invalid PID: %d", pid)
	}
	proc, err := os.FindProcess(pid)
	if err != nil {
		return err
	}
	// Try SIGTERM first
	if err := proc.Signal(syscall.SIGTERM); err != nil {
		return err
	}
	return nil
}

// BroadcastMessage sends a claude-irc message to all active task sessions.
func BroadcastMessage(tasks []*Task, message string) (int, error) {
	sent := 0
	var errs []string
	for _, t := range tasks {
		if !t.Status.IsActive() || t.IRCName == "" {
			continue
		}
		cmd := exec.Command("claude-irc", "msg", t.IRCName, message)
		cmd.Stderr = os.Stderr
		if err := cmd.Run(); err != nil {
			errs = append(errs, fmt.Sprintf("%s: %v", t.ID, err))
			continue
		}
		sent++
	}
	if len(errs) > 0 {
		return sent, fmt.Errorf("some messages failed: %s", strings.Join(errs, "; "))
	}
	return sent, nil
}

// AutoAssignDependents finds tasks waiting on the completed task and assigns them.
func AutoAssignDependents(store *Store, completedID string) ([]string, error) {
	cfg, err := store.LoadConfig()
	if err != nil {
		return nil, err
	}

	dependents, err := store.GetDependents(completedID)
	if err != nil {
		return nil, err
	}

	var assigned []string
	for _, dep := range dependents {
		if dep.Status != StatusCreated {
			continue
		}

		met, _, err := store.AreDependenciesMet(dep)
		if err != nil || !met {
			continue
		}

		// Prepare for assignment
		dep.IRCName = "whip-" + dep.ID
		dep.MasterIRCName = cfg.MasterIRCName
		if dep.MasterIRCName == "" {
			dep.MasterIRCName = "whip-master"
		}

		prompt := GeneratePrompt(dep)
		if err := store.SavePrompt(dep.ID, prompt); err != nil {
			continue
		}

		runner, err := Spawn(dep, store.PromptPath(dep.ID))
		if err != nil {
			continue
		}

		dep.Runner = runner
		dep.Status = StatusAssigned
		now := currentTime()
		dep.AssignedAt = &now
		dep.UpdatedAt = now
		if err := store.SaveTask(dep); err != nil {
			continue
		}

		assigned = append(assigned, dep.ID)

		// Notify master via IRC
		if cfg.MasterIRCName != "" {
			msg := fmt.Sprintf("Auto-assigned task %s (%s) — dependencies met", dep.ID, dep.Title)
			exec.Command("claude-irc", "msg", cfg.MasterIRCName, msg).Run()
		}
	}

	return assigned, nil
}

// HeartbeatFromEnv reads WHIP_SHELL_PID and WHIP_TASK_ID from environment.
func HeartbeatFromEnv() (taskID string, shellPID int, err error) {
	taskID = os.Getenv("WHIP_TASK_ID")
	pidStr := os.Getenv("WHIP_SHELL_PID")

	if taskID == "" {
		return "", 0, fmt.Errorf("WHIP_TASK_ID not set (are you running inside a whip task session?)")
	}
	if pidStr == "" {
		return "", 0, fmt.Errorf("WHIP_SHELL_PID not set (are you running inside a whip task session?)")
	}

	shellPID, err = strconv.Atoi(pidStr)
	if err != nil {
		return "", 0, fmt.Errorf("invalid WHIP_SHELL_PID: %s", pidStr)
	}

	return taskID, shellPID, nil
}

func currentTime() (t time.Time) {
	return time.Now()
}

// shellEscape wraps a string for safe use in a shell command.
func shellEscape(s string) string {
	return "'" + strings.ReplaceAll(s, "'", "'\"'\"'") + "'"
}

// appleScriptString wraps a string for use as an AppleScript string literal.
func appleScriptString(s string) string {
	escaped := strings.ReplaceAll(s, `\`, `\\`)
	escaped = strings.ReplaceAll(escaped, `"`, `\"`)
	return `"` + escaped + `"`
}
