package main

import (
	"os"

	irc "github.com/bang9/ai-tools/shared/agentirc"
	"github.com/spf13/cobra"
)

var (
	nameFlag string

	// Set via -ldflags at build time
	version = "dev"

	// detectSession is the function used to detect the current session.
	// Overridable in tests to isolate from the real session environment.
	detectSession = func(pid int) (*irc.Store, string, error) {
		return irc.DetectSession(pid)
	}
)

const dashboardOperatorName = "user"

func main() {
	root := &cobra.Command{
		Use:     "claude-irc",
		Short:   "IRC-inspired inter-session communication for Claude Code",
		Version: version,
	}

	root.PersistentFlags().StringVar(&nameFlag, "name", "", "Override peer name (only 'user' allowed without active session)")

	root.AddCommand(
		joinCmd(),
		whoCmd(),
		whoamiCmd(),
		msgCmd(),
		inboxCmd(),
		quitCmd(),
		cleanCmd(),
		daemonCmd(),
		upgradeCmd(),
	)

	if err := root.Execute(); err != nil {
		os.Exit(1)
	}
}
