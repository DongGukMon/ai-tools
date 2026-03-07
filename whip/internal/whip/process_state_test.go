package whip

import (
	"os"
	"os/exec"
	"testing"
)

func TestTaskProcessState(t *testing.T) {
	t.Run("none without pid", func(t *testing.T) {
		task := NewTask("test", "", "/tmp")
		if got := TaskProcessState(task); got != ProcessStateNone {
			t.Fatalf("TaskProcessState() = %q, want %q", got, ProcessStateNone)
		}
	})

	t.Run("alive while process exists", func(t *testing.T) {
		task := NewTask("test", "", "/tmp")
		task.ShellPID = os.Getpid()
		task.Status = StatusInProgress

		if got := TaskProcessState(task); got != ProcessStateAlive {
			t.Fatalf("TaskProcessState() = %q, want %q", got, ProcessStateAlive)
		}
	})

	t.Run("completed dead process is exited", func(t *testing.T) {
		pid := deadPID(t)
		task := NewTask("test", "", "/tmp")
		task.ShellPID = pid
		task.Status = StatusCompleted

		if got := TaskProcessState(task); got != ProcessStateExited {
			t.Fatalf("TaskProcessState() = %q, want %q", got, ProcessStateExited)
		}
	})

	t.Run("active dead process is dead", func(t *testing.T) {
		pid := deadPID(t)
		task := NewTask("test", "", "/tmp")
		task.ShellPID = pid
		task.Status = StatusInProgress

		if got := TaskProcessState(task); got != ProcessStateDead {
			t.Fatalf("TaskProcessState() = %q, want %q", got, ProcessStateDead)
		}
	})
}

func deadPID(t *testing.T) int {
	t.Helper()

	cmd := exec.Command("sleep", "30")
	if err := cmd.Start(); err != nil {
		t.Fatalf("start sleep: %v", err)
	}

	pid := cmd.Process.Pid
	if err := cmd.Process.Kill(); err != nil {
		t.Fatalf("kill sleep: %v", err)
	}
	if err := cmd.Wait(); err == nil {
		t.Fatal("expected killed process to return an error")
	}

	return pid
}
