package main

import (
	"fmt"
	"os"

	"github.com/bang9/ai-tools/whip/internal/whip"
	"github.com/spf13/cobra"
)

func assignCmd() *cobra.Command {
	var masterIRC string
	var saveMasterIRC bool

	cmd := &cobra.Command{
		Use:     "assign <id>",
		Short:   "Assign task to a new terminal session",
		Long:    lifecycleHelp("assign"),
		GroupID: "lifecycle",
		Args:    cobra.ExactArgs(1),
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

			cfg, err := store.LoadConfig()
			if err != nil {
				return err
			}
			resolvedMasterIRC := resolveMasterIRCName(cfg, task.WorkspaceName(), masterIRC)
			if masterIRC != "" && saveMasterIRC {
				if task.WorkspaceName() != whip.GlobalWorkspaceName {
					return fmt.Errorf("--save-master-irc is only supported for the global workspace")
				}
				if _, err := store.UpdateConfig(func(cfg *whip.Config) error {
					cfg.MasterIRCName = resolvedMasterIRC
					return nil
				}); err != nil {
					return err
				}
			}

			task, err = whip.AssignTask(store, id, whip.LaunchSource{Actor: "cli", Command: "assign"}, resolvedMasterIRC)
			if err != nil {
				return err
			}

			fmt.Fprintf(os.Stderr, "Assigned task %s -> %s (runner: %s)\n", task.ID, task.Status, task.Runner)
			return nil
		},
	}

	cmd.Flags().StringVar(&masterIRC, "master-irc", "", "Master session IRC name for this assignment")
	cmd.Flags().BoolVar(&saveMasterIRC, "save-master-irc", false, "Persist --master-irc to config.json for future assignments")
	return cmd
}
