package main

import (
	"os"

	"github.com/spf13/cobra"
)

var version = "dev"

func main() {
	root := newRootCmd()
	if err := root.Execute(); err != nil {
		os.Exit(1)
	}
}

func newRootCmd() *cobra.Command {
	root := &cobra.Command{
		Use:     "whip",
		Short:   "Task orchestrator for AI coding sessions",
		Version: version,
	}

	root.AddCommand(
		createCmd(),
		listCmd(),
		showCmd(),
		assignCmd(),
		attachCmd(),
		unassignCmd(),
		statusCmd(),
		approveCmd(),
		retryCmd(),
		resumeCmd(),
		broadcastCmd(),
		heartbeatCmd(),
		killCmd(),
		deleteCmd(),
		cleanCmd(),
		dashboardCmd(),
		depCmd(),
		remoteCmd(),
		helloCmd(),
		upgradeCmd(),
		versionCmd(),
	)

	return root
}
