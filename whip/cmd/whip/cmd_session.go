package main

import (
	"fmt"
	"os"
	"os/exec"
	"syscall"
	"time"

	"github.com/bang9/ai-tools/whip/internal/whip"
	tea "github.com/charmbracelet/bubbletea"
	"github.com/spf13/cobra"
)

func assignCmd() *cobra.Command {
	var masterIRC string
	var saveMasterIRC bool

	cmd := &cobra.Command{
		Use:   "assign <id>",
		Short: "Assign task to a new terminal session",
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
			resolvedMasterIRC := resolveMasterIRCName(cfg, masterIRC)
			if masterIRC != "" && saveMasterIRC {
				if _, err := store.UpdateConfig(func(cfg *whip.Config) error {
					cfg.MasterIRCName = resolvedMasterIRC
					return nil
				}); err != nil {
					return err
				}
			}

			task, err := whip.AssignCreatedTask(store, id, whip.LaunchSource{Actor: "cli", Command: "assign"}, resolvedMasterIRC)
			if err != nil {
				return err
			}

			fmt.Fprintf(os.Stderr, "Assigned task %s → IRC: %s (runner: %s)\n", task.ID, task.IRCName, task.Runner)
			return nil
		},
	}

	cmd.Flags().StringVar(&masterIRC, "master-irc", "", "Master session IRC name for this assignment")
	cmd.Flags().BoolVar(&saveMasterIRC, "save-master-irc", false, "Persist --master-irc to config.json for future assignments")
	return cmd
}

func attachCmd() *cobra.Command {
	return &cobra.Command{
		Use:   "attach <id>",
		Short: "Attach to a tmux task session",
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
			if task.Runner != "tmux" {
				return fmt.Errorf("attach is only supported for tmux sessions (task %s uses %q)", id, task.Runner)
			}
			if !whip.IsTmuxSession(id) {
				return fmt.Errorf("tmux session for task %s not found", id)
			}

			return whip.AttachTmuxSession(id)
		},
	}
}

func unassignCmd() *cobra.Command {
	return &cobra.Command{
		Use:   "unassign <id>",
		Short: "Kill task session and reset to created",
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
			if !task.Status.IsActive() {
				return fmt.Errorf("task %s is %s, not active", id, task.Status)
			}

			if task.Runner == "tmux" && whip.IsTmuxSession(id) {
				whip.KillTmuxSession(id)
			}
			if task.ShellPID > 0 {
				whip.KillProcess(task.ShellPID)
			}

			task, err = store.UpdateTask(id, func(task *whip.Task) error {
				from := task.Status
				task.Status = whip.StatusCreated
				task.Runner = ""
				task.ShellPID = 0
				task.IRCName = ""
				task.AssignedAt = nil
				task.HeartbeatAt = nil
				task.UpdatedAt = time.Now()
				task.RecordEvent("cli", "unassign", "unassigned", from, task.Status, "session reset to created")
				return nil
			})
			if err != nil {
				return err
			}

			fmt.Fprintf(os.Stderr, "Unassigned task %s\n", id)
			return nil
		},
	}
}

func statusCmd() *cobra.Command {
	var note string

	cmd := &cobra.Command{
		Use:   "status <id> [new-status]",
		Short: "Get or set task status",
		Args:  cobra.RangeArgs(1, 2),
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
			if len(args) == 1 && !cmd.Flags().Changed("note") {
				fmt.Printf("%s (%s): %s\n", task.ID, task.Title, task.Status)
				if task.Note != "" {
					fmt.Printf("Note: %s\n", task.Note)
				}
				return nil
			}

			var newStatus whip.TaskStatus
			if len(args) == 2 {
				newStatus = whip.TaskStatus(args[1])
				if err := task.ValidateTransition(newStatus); err != nil {
					return err
				}
			}

			task, err = store.UpdateTask(id, func(task *whip.Task) error {
				if len(args) == 2 {
					if err := task.ValidateTransition(newStatus); err != nil {
						return err
					}
					from := task.Status
					task.Status = newStatus
					if newStatus == whip.StatusCompleted || newStatus == whip.StatusFailed {
						now := time.Now()
						task.CompletedAt = &now
					}
					task.RecordEvent("cli", "status", "status_change", from, task.Status, "")
				}

				if cmd.Flags().Changed("note") {
					task.AddNote(note)
					task.RecordEvent("cli", "status", "note", task.Status, task.Status, note)
				}
				task.UpdatedAt = time.Now()
				return nil
			})
			if err != nil {
				return err
			}

			fmt.Fprintf(os.Stderr, "Task %s → %s\n", id, task.Status)

			if task.Status == whip.StatusCompleted {
				assigned, err := whip.AutoAssignDependents(store, task.ID)
				if err != nil {
					fmt.Fprintf(os.Stderr, "Warning: auto-assign error: %v\n", err)
				}
				for _, aid := range assigned {
					fmt.Fprintf(os.Stderr, "Auto-assigned dependent: %s\n", aid)
				}
			}

			if task.Status.IsTerminal() && task.ShellPID > 0 {
				if err := whip.ScheduleTaskTermination(task); err != nil {
					fmt.Fprintf(os.Stderr, "Warning: schedule termination for %s: %v\n", id, err)
				}
			}

			return nil
		},
	}

	cmd.Flags().StringVar(&note, "note", "", "Progress note")
	return cmd
}

func approveCmd() *cobra.Command {
	return &cobra.Command{
		Use:   "approve <id>",
		Short: "Mark a review task approved and notify the assignee to finalize",
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

			task, err := store.UpdateTask(id, func(task *whip.Task) error {
				if task.Status != whip.StatusReview {
					return fmt.Errorf("task %s is %s, must be 'review' to approve", id, task.Status)
				}
				from := task.Status
				task.Status = whip.StatusApprovedPendingFinalize
				task.UpdatedAt = time.Now()
				task.RecordEvent("cli", "approve", "approved", from, task.Status, "review approved; awaiting finalize")
				return nil
			})
			if err != nil {
				return err
			}

			if task.IRCName != "" {
				commitMsg := fmt.Sprintf("Task %s approved. Status is now approved_pending_finalize. Commit your changes and run `whip status %s completed --note \"...\"` to finalize.", id, id)
				ircCmd := exec.Command("claude-irc", "msg", task.IRCName, commitMsg)
				ircCmd.Stderr = os.Stderr
				if err := ircCmd.Run(); err != nil {
					fmt.Fprintf(os.Stderr, "Warning: approval state recorded, but IRC notification failed: %v\n", err)
				}
			} else {
				fmt.Fprintf(os.Stderr, "Warning: task %s has no IRC target; approval state recorded without agent notification\n", id)
			}

			fmt.Fprintf(os.Stderr, "Task %s → %s (approval recorded; finalization still requires a later completed/failed transition)\n", id, task.Status)
			return nil
		},
	}
}

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
			task, err := whip.RetryTaskRun(store, id, whip.LaunchSource{Actor: "cli", Command: "retry"}, resolveMasterIRCName(cfg, ""))
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

func broadcastCmd() *cobra.Command {
	return &cobra.Command{
		Use:   "broadcast <message>",
		Short: "Send message to all active sessions",
		Args:  cobra.ExactArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			store, err := whip.NewStore()
			if err != nil {
				return err
			}

			tasks, err := store.ListTasks()
			if err != nil {
				return err
			}

			sent, err := whip.BroadcastMessage(tasks, args[0])
			fmt.Fprintf(os.Stderr, "Broadcast sent to %d session(s)\n", sent)
			if err != nil {
				fmt.Fprintf(os.Stderr, "Warning: %v\n", err)
			}
			return nil
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

func killCmd() *cobra.Command {
	return &cobra.Command{
		Use:   "kill <id>",
		Short: "Force kill a task session",
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

			if task.Runner == "tmux" && whip.IsTmuxSession(id) {
				if err := whip.KillTmuxSession(id); err != nil {
					fmt.Fprintf(os.Stderr, "Warning: kill tmux session: %v\n", err)
				}
			}
			if task.ShellPID > 0 {
				if err := whip.KillProcess(task.ShellPID); err != nil {
					fmt.Fprintf(os.Stderr, "Warning: kill PID %d: %v\n", task.ShellPID, err)
				}
			}

			task, err = store.UpdateTask(id, func(task *whip.Task) error {
				from := task.Status
				task.Status = whip.StatusFailed
				task.AddNote("killed")
				now := time.Now()
				task.CompletedAt = &now
				task.UpdatedAt = now
				task.RecordEvent("cli", "kill", "killed", from, task.Status, fmt.Sprintf("shell_pid=%d", task.ShellPID))
				return nil
			})
			if err != nil {
				return err
			}

			fmt.Fprintf(os.Stderr, "Killed task %s (PID: %d)\n", id, task.ShellPID)
			return nil
		},
	}
}

func deleteCmd() *cobra.Command {
	return &cobra.Command{
		Use:   "delete <id> [id...]",
		Short: "Delete tasks and their sessions",
		Args:  cobra.MinimumNArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			store, err := whip.NewStore()
			if err != nil {
				return err
			}

			for _, arg := range args {
				id, err := store.ResolveID(arg)
				if err != nil {
					fmt.Fprintf(os.Stderr, "Warning: %v\n", err)
					continue
				}

				task, err := store.LoadTask(id)
				if err != nil {
					fmt.Fprintf(os.Stderr, "Warning: %v\n", err)
					continue
				}

				if task.Runner == "tmux" && whip.IsTmuxSession(id) {
					_ = whip.KillTmuxSession(id)
				}
				if task.ShellPID > 0 && whip.IsProcessAlive(task.ShellPID) {
					_ = whip.KillProcess(task.ShellPID)
				}

				if err := store.DeleteTask(id); err != nil {
					fmt.Fprintf(os.Stderr, "Warning: delete %s: %v\n", id, err)
					continue
				}
				fmt.Fprintf(os.Stderr, "Deleted task %s (%s)\n", id, task.Title)
			}
			return nil
		},
	}
}

func cleanCmd() *cobra.Command {
	return &cobra.Command{
		Use:   "clean",
		Short: "Remove completed and failed tasks",
		Args:  cobra.NoArgs,
		RunE: func(cmd *cobra.Command, args []string) error {
			store, err := whip.NewStore()
			if err != nil {
				return err
			}

			count, err := store.CleanTerminal()
			if err != nil {
				return err
			}

			fmt.Fprintf(os.Stderr, "Cleaned %d task(s)\n", count)
			exec.Command("claude-irc", "clean").Run()
			return nil
		},
	}
}

func dashboardCmd() *cobra.Command {
	return &cobra.Command{
		Use:     "dashboard",
		Short:   "Live task dashboard (TUI)",
		Aliases: []string{"dash"},
		Args:    cobra.NoArgs,
		RunE: func(cmd *cobra.Command, args []string) error {
			store, err := whip.NewStore()
			if err != nil {
				return err
			}

			p := tea.NewProgram(
				whip.NewDashboardModel(store, version),
				tea.WithAltScreen(),
			)
			for {
				m, err := p.Run()
				if err != nil {
					return err
				}
				dm, ok := m.(whip.DashboardModel)
				if !ok {
					return nil
				}
				sessionName := dm.PendingAttach()
				if sessionName == "" {
					dm.Cleanup()
					return nil
				}
				if whip.IsTmuxSessionName(sessionName) {
					_ = whip.AttachTmuxSessionName(sessionName)
				} else {
					fmt.Fprintf(os.Stderr, "tmux session %s no longer exists\n", sessionName)
				}
				p = tea.NewProgram(
					whip.NewDashboardModel(store, version),
					tea.WithAltScreen(),
				)
			}
		},
	}
}
