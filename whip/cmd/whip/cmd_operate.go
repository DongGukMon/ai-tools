package main

import (
	"fmt"
	"os"
	"os/exec"

	"github.com/bang9/ai-tools/whip/internal/whip"
	tea "github.com/charmbracelet/bubbletea"
	"github.com/spf13/cobra"
)

func deleteCmd() *cobra.Command {
	return &cobra.Command{
		Use:     "delete <id>",
		Short:   "Permanently delete an archived task (workspace tasks require an archived workspace)",
		GroupID: "operations",
		Args:    cobra.ExactArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			store, err := whip.NewStore()
			if err != nil {
				return err
			}

			id, err := store.ResolveArchivedID(args[0])
			if err != nil {
				if activeID, activeErr := store.ResolveID(args[0]); activeErr == nil {
					return fmt.Errorf("task %s is active; archive it before deleting", activeID)
				}
				return err
			}

			task, err := store.LoadArchivedTask(id)
			if err != nil {
				return err
			}
			if err := store.DeleteArchivedTask(id); err != nil {
				return err
			}

			fmt.Fprintf(os.Stderr, "Deleted archived task %s (%s)\n", id, task.Title)
			return nil
		},
	}
}

func archiveCmd() *cobra.Command {
	return &cobra.Command{
		Use:     "archive <id>",
		Short:   "Archive one completed or canceled active task",
		GroupID: "operations",
		Args:    cobra.ExactArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			store, err := whip.NewStore()
			if err != nil {
				return err
			}

			id, err := store.ResolveID(args[0])
			if err != nil {
				if archivedID, archivedErr := store.ResolveArchivedID(args[0]); archivedErr == nil {
					return fmt.Errorf("task %s is already archived", archivedID)
				}
				return err
			}

			task, err := store.LoadTask(id)
			if err != nil {
				return err
			}
			if err := store.ArchiveTask(id); err != nil {
				return err
			}

			fmt.Fprintf(os.Stderr, "Archived task %s (%s)\n", id, task.Title)
			return nil
		},
	}
}

func cleanCmd() *cobra.Command {
	return &cobra.Command{
		Use:     "clean",
		Short:   "Archive all archiveable completed and canceled tasks",
		GroupID: "operations",
		Args:    cobra.NoArgs,
		RunE: func(cmd *cobra.Command, args []string) error {
			store, err := whip.NewStore()
			if err != nil {
				return err
			}

			count, err := store.ArchiveTerminal()
			if err != nil {
				return err
			}

			fmt.Fprintf(os.Stderr, "Archived %d task(s)\n", count)
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

			model := whip.NewDashboardModel(store, version)
			p := tea.NewProgram(
				model,
				tea.WithAltScreen(),
			)
			model.SetProgram(p)
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
				model = whip.NewDashboardModel(store, version)
				p = tea.NewProgram(
					model,
					tea.WithAltScreen(),
				)
				model.SetProgram(p)
			}
		},
	}
}
