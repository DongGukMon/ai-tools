package whip

import (
	"fmt"
	"os"
	"strconv"
	"syscall"
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

	if pgid, err := syscall.Getpgid(pid); err == nil && pgid > 0 {
		if err := syscall.Kill(-pgid, syscall.SIGTERM); err == nil {
			return nil
		}
	}

	proc, err := os.FindProcess(pid)
	if err != nil {
		return err
	}
	if err := proc.Signal(syscall.SIGTERM); err != nil {
		return err
	}
	return nil
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
