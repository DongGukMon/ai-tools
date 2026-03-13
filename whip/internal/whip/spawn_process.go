package whip

import (
	"fmt"
	"os"
	"strconv"
	"syscall"
	"time"
)

func IsProcessAlive(pid int) bool {
	if pid <= 0 {
		return false
	}
	proc, err := os.FindProcess(pid)
	if err != nil {
		return false
	}
	err = proc.Signal(syscall.Signal(0))
	return err == nil
}

func KillProcess(pid int) error {
	if pid <= 0 {
		return fmt.Errorf("invalid PID: %d", pid)
	}

	killGroup := func(sig syscall.Signal) error {
		pgid, err := syscall.Getpgid(pid)
		if err != nil || pgid <= 0 {
			return fmt.Errorf("pgid lookup failed")
		}
		return syscall.Kill(-pgid, sig)
	}

	killPID := func(sig syscall.Signal) error {
		proc, err := os.FindProcess(pid)
		if err != nil {
			return err
		}
		return proc.Signal(sig)
	}

	if pgid, err := syscall.Getpgid(pid); err == nil && pgid > 0 {
		if err := syscall.Kill(-pgid, syscall.SIGTERM); err == nil {
			deadline := time.Now().Add(500 * time.Millisecond)
			for IsProcessAlive(pid) && time.Now().Before(deadline) {
				time.Sleep(25 * time.Millisecond)
			}
			if !IsProcessAlive(pid) {
				return nil
			}
			if err := killGroup(syscall.SIGKILL); err == nil {
				return nil
			}
		}
	}

	if err := killPID(syscall.SIGTERM); err != nil {
		return err
	}
	deadline := time.Now().Add(500 * time.Millisecond)
	for IsProcessAlive(pid) && time.Now().Before(deadline) {
		time.Sleep(25 * time.Millisecond)
	}
	if !IsProcessAlive(pid) {
		return nil
	}
	return killPID(syscall.SIGKILL)
}

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
