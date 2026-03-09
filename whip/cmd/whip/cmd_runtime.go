package main

import (
	"fmt"
	"os"

	"github.com/bang9/ai-tools/whip/internal/whip"
	"github.com/spf13/cobra"
)

func startCmd() *cobra.Command {
	var note string

	cmd := &cobra.Command{
		Use:     "start <id>",
		Short:   "Mark an assigned task as in progress",
		Long:    lifecycleHelp("start"),
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

			task, err := whip.StartTask(store, id, whip.LaunchSource{Actor: "cli", Command: "start"}, note)
			if err != nil {
				return err
			}

			fmt.Fprintf(os.Stderr, "Task %s -> %s\n", task.ID, task.Status)
			return nil
		},
	}

	cmd.Flags().StringVar(&note, "note", "", "Attach a note while starting the task")
	return cmd
}
