package main

import (
	"fmt"
	"os"
	"syscall"
	"time"

	"github.com/bang9/ai-tools/whip/internal/whip"
	"github.com/spf13/cobra"
)

func retryCmd() *cobra.Command {
	return &cobra.Command{
		Use:   "retry <id>",
		Short: "Retry a failed task (resumes previous session context if available)",
		Args:  cobra.ExactArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			store, err := whip.NewStore()
			if err != nil {
				return err
			}

			id, err := store.ResolveID(args[0])
			if err != nil {
				return err
			}

			cfg, err := store.LoadConfig()
			if err != nil {
				return err
			}
			existing, err := store.LoadTask(id)
			if err != nil {
				return err
			}
			task, err := whip.RetryTaskRun(store, id, whip.LaunchSource{Actor: "cli", Command: "retry"}, resolveMasterIRCName(cfg, existing.WorkspaceName(), ""))
			if err != nil {
				return err
			}

			fmt.Fprintf(os.Stderr, "Retried task %s → IRC: %s (runner: %s, session resumed: %v)\n",
				task.ID, task.IRCName, task.Runner, task.SessionID != "")
			return nil
		},
	}
}

func resumeCmd() *cobra.Command {
	return &cobra.Command{
		Use:   "resume <id>",
		Short: "Resume a task session interactively in the current terminal",
		Args:  cobra.ExactArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			store, err := whip.NewStore()
			if err != nil {
				return err
			}

			id, err := store.ResolveID(args[0])
			if err != nil {
				return err
			}

			task, err := store.LoadTask(id)
			if err != nil {
				return err
			}
			if task.SessionID == "" {
				return fmt.Errorf("task %s has no session ID (was it assigned before session tracking was added?)", id)
			}

			backend, err := whip.GetBackend(task.Backend)
			if err != nil {
				return err
			}

			path, execArgs, err := backend.ResumeExec(task)
			if err != nil {
				return err
			}

			if task.CWD != "" {
				if err := os.Chdir(task.CWD); err != nil {
					return fmt.Errorf("change directory to %s: %w", task.CWD, err)
				}
			}

			task, err = store.UpdateTask(id, func(task *whip.Task) error {
				from := task.Status
				task.ShellPID = os.Getpid()
				task.HeartbeatAt = ptrTime(time.Now())
				if task.Status == whip.StatusAssigned {
					task.Status = whip.StatusInProgress
				}
				task.UpdatedAt = time.Now()
				task.RecordEvent("cli", "resume", "resume", from, task.Status, fmt.Sprintf("shell_pid=%d session_id=%s", task.ShellPID, task.SessionID))
				return nil
			})
			if err != nil {
				return err
			}

			fmt.Fprintf(os.Stderr, "Resuming session %s for task %s (%s)...\n", task.SessionID, task.ID, task.Title)
			return syscall.Exec(path, execArgs, os.Environ())
		},
	}
}

func heartbeatCmd() *cobra.Command {
	return &cobra.Command{
		Use:   "heartbeat [id]",
		Short: "Register shell PID for a task session",
		Args:  cobra.MaximumNArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			store, err := whip.NewStore()
			if err != nil {
				return err
			}

			var taskID string
			var shellPID int

			if len(args) == 1 {
				taskID = args[0]
				_, pid, envErr := whip.HeartbeatFromEnv()
				if envErr == nil {
					shellPID = pid
				}
			} else {
				tid, pid, envErr := whip.HeartbeatFromEnv()
				if envErr != nil {
					return envErr
				}
				taskID = tid
				shellPID = pid
			}

			id, err := store.ResolveID(taskID)
			if err != nil {
				return err
			}

			_, err = store.UpdateTask(id, func(task *whip.Task) error {
				now := time.Now()
				task.ShellPID = shellPID
				task.HeartbeatAt = &now
				task.UpdatedAt = now
				task.RecordEvent("cli", "heartbeat", "heartbeat", task.Status, task.Status, fmt.Sprintf("shell_pid=%d", shellPID))
				return nil
			})
			if err != nil {
				return err
			}

			fmt.Fprintf(os.Stderr, "Heartbeat: task %s, PID %d recorded\n", id, shellPID)
			return nil
		},
	}
}
