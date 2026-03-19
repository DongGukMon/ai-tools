package main

import "github.com/spf13/cobra"

func taskCmd() *cobra.Command {
	cmd := &cobra.Command{
		Use:   "task",
		Short: "Manage tasks",
	}

	cmd.AddGroup(
		&cobra.Group{ID: "lifecycle", Title: "Lifecycle Commands"},
		&cobra.Group{ID: "operations", Title: "Operations"},
	)

	cmd.AddCommand(
		createCmd(),
		listCmd(),
		viewCmd(),
		taskTypeCmd(),
		lifecycleCmd(),
		assignCmd(),
		startCmd(),
		reviewCmd(),
		requestChangesCmd(),
		approveCmd(),
		completeCmd(),
		failCmd(),
		cancelCmd(),
		noteCmd(),
		deleteCmd(),
		cleanCmd(),
		archiveCmd(),
		depCmd(),
	)
	return cmd
}
