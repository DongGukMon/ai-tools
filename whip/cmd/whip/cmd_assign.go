package main

import (
	"fmt"
	"os"
	"time"

	"github.com/bang9/ai-tools/whip/internal/whip"
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
