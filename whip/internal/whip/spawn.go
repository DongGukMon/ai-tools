package whip

import (
	"fmt"
	"os"
	"os/exec"
	"strconv"
	"strings"
	"syscall"
	"time"
)

var startDetachedShellCommand = func(command string) error {
	cmd := exec.Command("sh", "-c", command)
	cmd.SysProcAttr = &syscall.SysProcAttr{Setsid: true}
	return cmd.Start()
}

// tmuxSessionName returns the tmux session name for a task.
func tmuxSessionName(taskID string) string {
	return "whip-" + taskID
}

// tmuxResumeSessionName returns the tmux session name for an interactive resume.
func tmuxResumeSessionName(taskID string) string {
	return "whip-resume-" + taskID
}

// SpawnTmuxSession creates a detached tmux session running the given shell
// command under the provided session name.
func SpawnTmuxSession(sessionName string, shellCmd string) error {
	cmd := exec.Command("tmux", "new-session", "-d",
		"-s", sessionName,
		"-x", "120", "-y", "40",
		shellCmd,
	)
	cmd.Stdout = os.Stderr
	cmd.Stderr = os.Stderr
	return cmd.Run()
}

// SpawnTmux creates a detached tmux session for a task.
func SpawnTmux(taskID string, shellCmd string) error {
	return SpawnTmuxSession(tmuxSessionName(taskID), shellCmd)
}

// Spawn uses the task's backend to build a launch command, then runs it via
// tmux (preferred) or Terminal.app. Returns the runner type.
func Spawn(task *Task, promptPath string) (string, error) {
	backend, err := GetBackend(task.Backend)
	if err != nil {
		return "", err
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

// IsTmuxSessionName checks if a tmux session exists for the given session name.
func IsTmuxSessionName(sessionName string) bool {
	cmd := exec.Command("tmux", "has-session", "-t", sessionName)
	return cmd.Run() == nil
}

// IsTmuxSession checks if a tmux session exists for the given task ID.
func IsTmuxSession(taskID string) bool {
	return IsTmuxSessionName(tmuxSessionName(taskID))
}

// KillTmuxSessionName kills the tmux session with the given session name.
func KillTmuxSessionName(sessionName string) error {
	cmd := exec.Command("tmux", "kill-session", "-t", sessionName)
	cmd.Stderr = os.Stderr
	return cmd.Run()
}

// KillTmuxSession kills the tmux session for the given task ID.
func KillTmuxSession(taskID string) error {
	return KillTmuxSessionName(tmuxSessionName(taskID))
}

// AttachTmuxSessionName attaches to the tmux session with the given session
// name. Runs as a subprocess so the caller resumes after tmux detach.
func AttachTmuxSessionName(sessionName string) error {
	cmd := exec.Command("tmux", "attach", "-t", sessionName)
	cmd.Stdin = os.Stdin
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	return cmd.Run()
}

// AttachTmuxSession attaches to the tmux session for the given task ID.
// Runs as a subprocess so the caller resumes after tmux detach.
func AttachTmuxSession(taskID string) error {
	return AttachTmuxSessionName(tmuxSessionName(taskID))
}

// CaptureTmuxPaneBySessionName captures the current pane content of a tmux
// session by session name.
func CaptureTmuxPaneBySessionName(sessionName string) (string, error) {
	cmd := exec.Command("tmux", "capture-pane", "-t", sessionName, "-p")
	out, err := cmd.Output()
	if err != nil {
		return "", err
	}
	return string(out), nil
}

// CaptureTmuxPane captures the current pane content of a task tmux session.
func CaptureTmuxPane(taskID string) (string, error) {
	return CaptureTmuxPaneBySessionName(tmuxSessionName(taskID))
}

// SpawnTerminal opens a new Terminal.app tab via osascript and runs the given
// shell command. Used as a fallback when tmux is not available.
func SpawnTerminal(taskID string, shellCmd string) error {
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

	if pgid, err := syscall.Getpgid(pid); err == nil && pgid > 0 {
		if err := syscall.Kill(-pgid, syscall.SIGTERM); err == nil {
			return nil
		}
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

// ScheduleTaskTermination asynchronously terminates the runner for a terminal task.
func ScheduleTaskTermination(task *Task) error {
	command := terminationCommand(task)
	if command == "" {
		return nil
	}
	return startDetachedShellCommand(command)
}

func terminationCommand(task *Task) string {
	if task == nil || !task.Status.IsTerminal() || task.ShellPID <= 0 {
		return ""
	}

	if task.Runner == "tmux" {
		return fmt.Sprintf(
			"sleep 3 && tmux kill-session -t %s 2>/dev/null",
			shellEscape(tmuxSessionName(task.ID)),
		)
	}

	if pgid, err := syscall.Getpgid(task.ShellPID); err == nil && pgid > 0 {
		return fmt.Sprintf(
			"sleep 3 && kill -TERM -- -%d 2>/dev/null || kill -TERM %d 2>/dev/null; sleep 2 && kill -KILL -- -%d 2>/dev/null || kill -KILL %d 2>/dev/null",
			pgid, task.ShellPID, pgid, task.ShellPID,
		)
	}

	return fmt.Sprintf(
		"sleep 3 && kill -TERM %d 2>/dev/null; sleep 2 && kill -KILL %d 2>/dev/null",
		task.ShellPID, task.ShellPID,
	)
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

		dep, err = AssignCreatedTask(store, dep.ID, LaunchSource{Actor: "auto", Command: "auto-assign"}, DefaultMasterIRCName(cfg))
		if err != nil {
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
