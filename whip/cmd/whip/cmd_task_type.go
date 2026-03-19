package main

import (
	"fmt"
	"os"
	"time"

	"github.com/bang9/ai-tools/whip/internal/whip"
	"github.com/spf13/cobra"
)

func taskTypeCmd() *cobra.Command {
	return &cobra.Command{
		Use:     "type <id> <type>",
		Short:   "Set a task type manually",
		GroupID: "operations",
		Args:    cobra.ExactArgs(2),
		RunE: func(cmd *cobra.Command, args []string) error {
			store, err := whip.NewStore()
			if err != nil {
				return err
			}

			id, err := store.ResolveID(args[0])
			if err != nil {
				return err
			}

			newType := args[1]
			if err := whip.ValidateTaskType(newType); err != nil {
				return err
			}

			task, err := store.UpdateTask(id, func(task *whip.Task) error {
				previousType := task.Type
				task.Type = newType
				task.UpdatedAt = time.Now()
				task.RecordEvent("cli", "type", "type_changed", task.Status, task.Status, fmt.Sprintf("%s -> %s", statsLabel(previousType), newType))
				return nil
			})
			if err != nil {
				return err
			}

			fmt.Fprintf(os.Stderr, "%s: type → %s\n", task.ID, task.Type)
			fmt.Print(task.ID)
			return nil
		},
	}
}
