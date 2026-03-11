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
		Use:     "delete <id> [id...]",
		Short:   "Delete tasks and their sessions",
		GroupID: "operations",
		Args:    cobra.MinimumNArgs(1),
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

func archiveCmd() *cobra.Command {
	return &cobra.Command{
		Use:     "archive",
		Short:   "Archive completed and canceled tasks",
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
			return nil
		},
	}
}

func cleanCmd() *cobra.Command {
	return &cobra.Command{
		Use:     "clean",
		Short:   "Remove completed and canceled tasks",
		GroupID: "operations",
		Args:    cobra.NoArgs,
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
