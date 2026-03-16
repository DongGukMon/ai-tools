package main

import (
	"fmt"
	"os"
	"text/tabwriter"

	"github.com/bang9/ai-tools/whip/internal/whip"
	"github.com/spf13/cobra"
)

func workspaceCmd() *cobra.Command {
	cmd := &cobra.Command{
		Use:   "workspace",
		Short: "Manage named workspaces",
	}

	cmd.AddCommand(
		workspaceListCmd(),
		workspaceViewCmd(),
		workspaceBroadcastCmd(),
		workspaceArchiveCmd(),
		workspaceDeleteCmd(),
	)
	return cmd
}

func workspaceListCmd() *cobra.Command {
	var showArchive bool
	var showAll bool

	cmd := &cobra.Command{
		Use:   "list",
		Short: "List named workspaces",
		Args:  cobra.NoArgs,
		RunE: func(cmd *cobra.Command, args []string) error {
			if showArchive && showAll {
				return fmt.Errorf("--archive and --all cannot be used together")
			}

			store, err := whip.NewStore()
			if err != nil {
				return err
			}

			workspaces, err := store.ListWorkspaces()
			if err != nil {
				return err
			}
			if len(workspaces) == 0 {
				fmt.Println("No workspaces.")
				return nil
			}

			filtered := make([]*whip.Workspace, 0, len(workspaces))
			for _, workspace := range workspaces {
				status := workspace.EffectiveStatus()
				if showAll {
					filtered = append(filtered, workspace)
					continue
				}
				if showArchive {
					if status == whip.WorkspaceStatusArchived {
						filtered = append(filtered, workspace)
					}
					continue
				}
				if status == whip.WorkspaceStatusActive {
					filtered = append(filtered, workspace)
				}
			}

			if len(filtered) == 0 {
				switch {
				case showAll:
					fmt.Println("No workspaces.")
				case showArchive:
					fmt.Println("No archived workspaces.")
				default:
					fmt.Println("No active workspaces.")
				}
				return nil
			}

			w := tabwriter.NewWriter(os.Stdout, 0, 0, 2, ' ', 0)
			fmt.Fprintln(w, "NAME\tSTATUS\tMODEL\tACTIVE\tARCHIVED\tTOTAL\tREPO\tWORKTREE")
			for _, workspace := range filtered {
				active, err := store.CountTasksInWorkspace(workspace.WorkspaceName())
				if err != nil {
					return err
				}
				archived, err := store.CountArchivedTasksInWorkspace(workspace.WorkspaceName())
				if err != nil {
					return err
				}
				fmt.Fprintf(w, "%s\t%s\t%s\t%d\t%d\t%d\t%s\t%s\n",
					workspace.WorkspaceName(),
					workspace.StatusLabel(),
					workspace.ExecutionModelLabel(),
					active,
					archived,
					active+archived,
					workspace.OriginalRepoPath,
					workspace.WorktreePath,
				)
			}
			return w.Flush()
		},
	}
	cmd.Flags().BoolVar(&showArchive, "archive", false, "List archived workspaces instead of active workspaces")
	cmd.Flags().BoolVar(&showAll, "all", false, "List all workspaces regardless of status")
	return cmd
}

func workspaceViewCmd() *cobra.Command {
	return &cobra.Command{
		Use:   "view <name>",
		Short: "View workspace details",
		Args:  cobra.ExactArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			name, err := resolveNamedWorkspaceArg(args[0])
			if err != nil {
				return err
			}

			store, err := whip.NewStore()
			if err != nil {
				return err
			}

			workspace, err := store.LoadWorkspace(name)
			if err != nil {
				return err
			}

			activeTasks, err := store.ListTasksInWorkspace(name)
			if err != nil {
				return err
			}
			archivedTasks, err := store.ListArchivedTasksInWorkspace(name)
			if err != nil {
				return err
			}

			fmt.Printf("Name:             %s\n", name)
			fmt.Printf("Status:           %s\n", workspace.StatusLabel())
			fmt.Printf("Execution model:  %s\n", workspace.ExecutionModelLabel())
			fmt.Printf("Original repo:    %s\n", workspace.OriginalRepoPath)
			fmt.Printf("Original cwd:     %s\n", workspace.OriginalCWD)
			fmt.Printf("Worktree path:    %s\n", workspace.WorktreePath)

			activeCount := 0
			for _, task := range activeTasks {
				if activeCount == 0 {
					fmt.Printf("\nActive tasks:\n")
				}
				activeCount++
				fmt.Printf("- %s  %s  %s\n", task.ID, task.Status, task.Title)
			}
			if activeCount == 0 {
				fmt.Printf("\nActive tasks:     none\n")
			}

			archivedCount := 0
			for _, task := range archivedTasks {
				if archivedCount == 0 {
					fmt.Printf("\nArchived tasks:\n")
				}
				archivedCount++
				fmt.Printf("- %s  %s  %s\n", task.ID, task.Status, task.Title)
			}
			if archivedCount == 0 {
				fmt.Printf("\nArchived tasks:   none\n")
			}
			return nil
		},
	}
}

func workspaceArchiveCmd() *cobra.Command {
	var force bool

	cmd := &cobra.Command{
		Use:   "archive <name>",
		Short: "Archive a terminal workspace and tear down its runtime",
		Args:  cobra.ExactArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			store, err := whip.NewStore()
			if err != nil {
				return err
			}

			name, err := resolveNamedWorkspaceArg(args[0])
			if err != nil {
				return err
			}
			count, err := whip.ArchiveWorkspace(store, name, force)
			if err != nil {
				return err
			}

			fmt.Fprintf(os.Stderr, "Archived workspace %s (%d task(s))\n", name, count)
			return nil
		},
	}
	cmd.Flags().BoolVar(&force, "force", false, "Auto-save uncommitted/unpushed changes before archiving")
	return cmd
}

func workspaceDeleteCmd() *cobra.Command {
	return &cobra.Command{
		Use:   "delete <name>",
		Short: "Permanently delete an archived workspace and its archived tasks",
		Args:  cobra.ExactArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			store, err := whip.NewStore()
			if err != nil {
				return err
			}

			name, err := resolveNamedWorkspaceArg(args[0])
			if err != nil {
				return err
			}
			count, err := whip.DeleteArchivedWorkspace(store, name)
			if err != nil {
				return err
			}

			fmt.Fprintf(os.Stderr, "Deleted workspace %s (%d archived task(s))\n", name, count)
			return nil
		},
	}
}

func resolveNamedWorkspaceArg(raw string) (string, error) {
	if err := whip.ValidateWorkspaceName(raw); err != nil {
		return "", err
	}
	name := whip.NormalizeWorkspaceName(raw)
	if name == whip.GlobalWorkspaceName {
		return "", fmt.Errorf("global is not a named workspace")
	}
	return name, nil
}

func workspaceBroadcastCmd() *cobra.Command {
	return &cobra.Command{
		Use:   "broadcast <name> <message>",
		Short: "Send a message to all active tasks in a workspace",
		Args:  cobra.ExactArgs(2),
		RunE: func(cmd *cobra.Command, args []string) error {
			workspaceName, err := resolveNamedWorkspaceArg(args[0])
			if err != nil {
				return err
			}

			store, err := whip.NewStore()
			if err != nil {
				return err
			}
			workspace, err := store.LoadWorkspace(workspaceName)
			if err != nil {
				return err
			}
			if workspace.IsArchived() {
				return fmt.Errorf("workspace %s is archived; broadcasting is disabled", workspaceName)
			}

			tasks, err := store.ListTasksInWorkspace(workspaceName)
			if err != nil {
				return err
			}

			sent, err := whip.BroadcastMessage(tasks, args[1])
			fmt.Fprintf(os.Stderr, "Broadcast sent to %d session(s) in workspace %s\n", sent, workspaceName)
			if err != nil {
				fmt.Fprintf(os.Stderr, "Warning: %v\n", err)
			}
			return nil
		},
	}
}
