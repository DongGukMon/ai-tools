package main

import (
	"fmt"
	"io"
	"os"
	"os/exec"
	"runtime"
	"path/filepath"
	"strings"
	"text/tabwriter"
	"time"

	tea "github.com/charmbracelet/bubbletea"
	"github.com/bang9/ai-tools/whip/internal/whip"
	"github.com/spf13/cobra"
)

var version = "dev"

func main() {
	root := &cobra.Command{
		Use:     "whip",
		Short:   "Task orchestrator for Claude Code",
		Version: version,
	}

	root.AddCommand(
		createCmd(),
		listCmd(),
		showCmd(),
		assignCmd(),
		unassignCmd(),
		statusCmd(),
		broadcastCmd(),
		heartbeatCmd(),
		killCmd(),
		cleanCmd(),
		dashboardCmd(),
		depCmd(),
		upgradeCmd(),
		versionCmd(),
	)

	if err := root.Execute(); err != nil {
		os.Exit(1)
	}
}

func createCmd() *cobra.Command {
	var desc, file, cwd string

	cmd := &cobra.Command{
		Use:   "create <title>",
		Short: "Create a new task",
		Args:  cobra.ExactArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			title := args[0]

			// Resolve description from --desc, --file, or stdin
			description, err := resolveDescription(desc, file)
			if err != nil {
				return err
			}

			// Default cwd to current directory
			if cwd == "" {
				cwd, err = os.Getwd()
				if err != nil {
					return fmt.Errorf("cannot determine working directory: %w", err)
				}
			}

			store, err := whip.NewStore()
			if err != nil {
				return err
			}

			task := whip.NewTask(title, description, cwd)
			if err := store.SaveTask(task); err != nil {
				return err
			}

			fmt.Fprintf(os.Stderr, "Created task %s: %s\n", task.ID, task.Title)
			fmt.Print(task.ID)
			return nil
		},
	}

	cmd.Flags().StringVar(&desc, "desc", "", "Task description")
	cmd.Flags().StringVar(&file, "file", "", "Read description from file")
	cmd.Flags().StringVar(&cwd, "cwd", "", "Working directory (default: current)")

	return cmd
}

func listCmd() *cobra.Command {
	return &cobra.Command{
		Use:   "list",
		Short: "List all tasks",
		Aliases: []string{"ls"},
		Args:  cobra.NoArgs,
		RunE: func(cmd *cobra.Command, args []string) error {
			store, err := whip.NewStore()
			if err != nil {
				return err
			}

			tasks, err := store.ListTasks()
			if err != nil {
				return err
			}

			if len(tasks) == 0 {
				fmt.Println("No tasks.")
				return nil
			}

			w := tabwriter.NewWriter(os.Stdout, 0, 0, 2, ' ', 0)
			fmt.Fprintln(w, "ID\tTITLE\tSTATUS\tIRC\tPID\tUPDATED")
			for _, t := range tasks {
				pid := ""
				if t.ShellPID > 0 {
					alive := "dead"
					if whip.IsProcessAlive(t.ShellPID) {
						alive = "alive"
					}
					pid = fmt.Sprintf("%d (%s)", t.ShellPID, alive)
				}
				fmt.Fprintf(w, "%s\t%s\t%s\t%s\t%s\t%s\n",
					t.ID,
					truncate(t.Title, 30),
					t.Status,
					t.IRCName,
					pid,
					timeAgo(t.UpdatedAt),
				)
			}
			w.Flush()
			return nil
		},
	}
}

func showCmd() *cobra.Command {
	return &cobra.Command{
		Use:   "show <id>",
		Short: "Show task details",
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

			fmt.Printf("ID:          %s\n", task.ID)
			fmt.Printf("Title:       %s\n", task.Title)
			fmt.Printf("Status:      %s\n", task.Status)
			fmt.Printf("CWD:         %s\n", task.CWD)
			fmt.Printf("IRC:         %s\n", task.IRCName)
			fmt.Printf("Master IRC:  %s\n", task.MasterIRCName)
			if task.ShellPID > 0 {
				alive := "dead"
				if whip.IsProcessAlive(task.ShellPID) {
					alive = "alive"
				}
				fmt.Printf("Shell PID:   %d (%s)\n", task.ShellPID, alive)
			}
			if task.Note != "" {
				fmt.Printf("Note:        %s\n", task.Note)
			}
			if len(task.DependsOn) > 0 {
				fmt.Printf("Depends on:  %s\n", strings.Join(task.DependsOn, ", "))
			}
			fmt.Printf("Created:     %s\n", task.CreatedAt.Format(time.RFC3339))
			fmt.Printf("Updated:     %s\n", task.UpdatedAt.Format(time.RFC3339))
			if task.AssignedAt != nil {
				fmt.Printf("Assigned:    %s\n", task.AssignedAt.Format(time.RFC3339))
			}
			if task.CompletedAt != nil {
				fmt.Printf("Completed:   %s\n", task.CompletedAt.Format(time.RFC3339))
			}

			if task.Description != "" {
				fmt.Printf("\n--- Description ---\n%s\n", task.Description)
			}

			return nil
		},
	}
}

func assignCmd() *cobra.Command {
	var masterIRC string

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

			task, err := store.LoadTask(id)
			if err != nil {
				return err
			}

			if task.Status != whip.StatusCreated {
				return fmt.Errorf("task %s is %s, must be 'created' to assign", id, task.Status)
			}

			// Check dependencies
			met, unmet, err := store.AreDependenciesMet(task)
			if err != nil {
				return err
			}
			if !met {
				return fmt.Errorf("unmet dependencies: %s", strings.Join(unmet, ", "))
			}

			// Resolve master IRC name
			cfg, err := store.LoadConfig()
			if err != nil {
				return err
			}
			if masterIRC != "" {
				cfg.MasterIRCName = masterIRC
				if err := store.SaveConfig(cfg); err != nil {
					return err
				}
			}
			if cfg.MasterIRCName == "" {
				cfg.MasterIRCName = "whip-master"
				store.SaveConfig(cfg)
			}

			// Set task IRC names
			task.IRCName = "whip-" + task.ID
			task.MasterIRCName = cfg.MasterIRCName

			// Generate prompt
			prompt := whip.GeneratePrompt(task)
			if err := store.SavePrompt(task.ID, prompt); err != nil {
				return err
			}

			// Spawn terminal
			if err := whip.SpawnTerminal(task, store.PromptPath(task.ID)); err != nil {
				return fmt.Errorf("failed to spawn terminal: %w", err)
			}

			// Update task status
			task.Status = whip.StatusAssigned
			now := time.Now()
			task.AssignedAt = &now
			task.UpdatedAt = now
			if err := store.SaveTask(task); err != nil {
				return err
			}

			fmt.Fprintf(os.Stderr, "Assigned task %s → IRC: %s\n", task.ID, task.IRCName)
			return nil
		},
	}

	cmd.Flags().StringVar(&masterIRC, "master-irc", "", "Master session IRC name (saved for future use)")
	return cmd
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

			// Kill process if running
			if task.ShellPID > 0 {
				whip.KillProcess(task.ShellPID)
			}

			// Reset
			task.Status = whip.StatusCreated
			task.ShellPID = 0
			task.IRCName = ""
			task.AssignedAt = nil
			task.UpdatedAt = time.Now()
			if err := store.SaveTask(task); err != nil {
				return err
			}

			fmt.Fprintf(os.Stderr, "Unassigned task %s\n", id)
			return nil
		},
	}
}

func statusCmd() *cobra.Command {
	var note string

	cmd := &cobra.Command{
		Use:   "status <id> [new-status]",
		Short: "Get or set task status",
		Args:  cobra.RangeArgs(1, 2),
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

			// Just display if no new status
			if len(args) == 1 && !cmd.Flags().Changed("note") {
				fmt.Printf("%s (%s): %s\n", task.ID, task.Title, task.Status)
				if task.Note != "" {
					fmt.Printf("Note: %s\n", task.Note)
				}
				return nil
			}

			// Update status
			if len(args) == 2 {
				newStatus := whip.TaskStatus(args[1])
				if err := task.ValidateTransition(newStatus); err != nil {
					return err
				}
				task.Status = newStatus

				if newStatus == whip.StatusCompleted || newStatus == whip.StatusFailed {
					now := time.Now()
					task.CompletedAt = &now
				}
			}

			if cmd.Flags().Changed("note") {
				task.Note = note
			}
			task.UpdatedAt = time.Now()

			if err := store.SaveTask(task); err != nil {
				return err
			}

			fmt.Fprintf(os.Stderr, "Task %s → %s\n", id, task.Status)

			// Auto-assign dependents on completion
			if task.Status == whip.StatusCompleted {
				assigned, err := whip.AutoAssignDependents(store, task.ID)
				if err != nil {
					fmt.Fprintf(os.Stderr, "Warning: auto-assign error: %v\n", err)
				}
				for _, aid := range assigned {
					fmt.Fprintf(os.Stderr, "Auto-assigned dependent: %s\n", aid)
				}
			}

			return nil
		},
	}

	cmd.Flags().StringVar(&note, "note", "", "Progress note")
	return cmd
}

func broadcastCmd() *cobra.Command {
	return &cobra.Command{
		Use:   "broadcast <message>",
		Short: "Send message to all active sessions",
		Args:  cobra.ExactArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			store, err := whip.NewStore()
			if err != nil {
				return err
			}

			tasks, err := store.ListTasks()
			if err != nil {
				return err
			}

			sent, err := whip.BroadcastMessage(tasks, args[0])
			fmt.Fprintf(os.Stderr, "Broadcast sent to %d session(s)\n", sent)
			if err != nil {
				fmt.Fprintf(os.Stderr, "Warning: %v\n", err)
			}
			return nil
		},
	}
}

func heartbeatCmd() *cobra.Command {
	return &cobra.Command{
		Use:   "heartbeat [id]",
		Short: "Register shell PID for a task session",
		Args:  cobra.MaximumNArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			store, err := whip.NewStore()
			if err != nil {
				return err
			}

			var taskID string
			var shellPID int

			if len(args) == 1 {
				taskID = args[0]
				// Try env for PID
				_, pid, envErr := whip.HeartbeatFromEnv()
				if envErr == nil {
					shellPID = pid
				}
			} else {
				// Both from env
				tid, pid, envErr := whip.HeartbeatFromEnv()
				if envErr != nil {
					return envErr
				}
				taskID = tid
				shellPID = pid
			}

			id, err := store.ResolveID(taskID)
			if err != nil {
				return err
			}

			task, err := store.LoadTask(id)
			if err != nil {
				return err
			}

			task.ShellPID = shellPID
			if task.Status == whip.StatusAssigned {
				task.Status = whip.StatusInProgress
			}
			task.UpdatedAt = time.Now()

			if err := store.SaveTask(task); err != nil {
				return err
			}

			fmt.Fprintf(os.Stderr, "Heartbeat: task %s, PID %d → in_progress\n", id, shellPID)
			return nil
		},
	}
}

func killCmd() *cobra.Command {
	return &cobra.Command{
		Use:   "kill <id>",
		Short: "Force kill a task session",
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

			if task.ShellPID > 0 {
				if err := whip.KillProcess(task.ShellPID); err != nil {
					fmt.Fprintf(os.Stderr, "Warning: kill PID %d: %v\n", task.ShellPID, err)
				}
			}

			task.Status = whip.StatusFailed
			task.Note = "killed"
			now := time.Now()
			task.CompletedAt = &now
			task.UpdatedAt = now
			if err := store.SaveTask(task); err != nil {
				return err
			}

			fmt.Fprintf(os.Stderr, "Killed task %s (PID: %d)\n", id, task.ShellPID)
			return nil
		},
	}
}

func cleanCmd() *cobra.Command {
	return &cobra.Command{
		Use:   "clean",
		Short: "Remove completed and failed tasks",
		Args:  cobra.NoArgs,
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
			return nil
		},
	}
}

func dashboardCmd() *cobra.Command {
	return &cobra.Command{
		Use:   "dashboard",
		Short: "Live task dashboard (TUI)",
		Aliases: []string{"dash"},
		Args:  cobra.NoArgs,
		RunE: func(cmd *cobra.Command, args []string) error {
			store, err := whip.NewStore()
			if err != nil {
				return err
			}

			p := tea.NewProgram(
				whip.NewDashboardModel(store),
				tea.WithAltScreen(),
			)
			_, err = p.Run()
			return err
		},
	}
}

func depCmd() *cobra.Command {
	var after []string

	cmd := &cobra.Command{
		Use:   "dep <id>",
		Short: "Set task dependencies",
		Args:  cobra.ExactArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			if len(after) == 0 {
				return fmt.Errorf("at least one --after flag required")
			}

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

			// Resolve all dependency IDs
			for _, depIDPrefix := range after {
				depID, err := store.ResolveID(depIDPrefix)
				if err != nil {
					return fmt.Errorf("dependency %s: %w", depIDPrefix, err)
				}
				if depID == id {
					return fmt.Errorf("task cannot depend on itself")
				}
				// Avoid duplicates
				found := false
				for _, existing := range task.DependsOn {
					if existing == depID {
						found = true
						break
					}
				}
				if !found {
					task.DependsOn = append(task.DependsOn, depID)
				}
			}

			task.UpdatedAt = time.Now()
			if err := store.SaveTask(task); err != nil {
				return err
			}

			fmt.Fprintf(os.Stderr, "Task %s depends on: %s\n", id, strings.Join(task.DependsOn, ", "))
			return nil
		},
	}

	cmd.Flags().StringArrayVar(&after, "after", nil, "Task ID that must complete first (repeatable)")
	return cmd
}

func upgradeCmd() *cobra.Command {
	return &cobra.Command{
		Use:   "upgrade",
		Short: "Upgrade whip to the latest version",
		Args:  cobra.NoArgs,
		RunE: func(cmd *cobra.Command, args []string) error {
			repo := "bang9/ai-tools"

			fmt.Fprintln(os.Stderr, "Checking for updates...")
			out, err := exec.Command("curl", "-sfSL",
				fmt.Sprintf("https://api.github.com/repos/%s/releases/latest", repo)).Output()
			if err != nil {
				return fmt.Errorf("failed to check latest version: %w", err)
			}

			latestVersion := ""
			for _, line := range strings.Split(string(out), "\n") {
				line = strings.TrimSpace(line)
				if strings.Contains(line, `"tag_name"`) {
					parts := strings.Split(line, `"`)
					if len(parts) >= 4 {
						latestVersion = parts[3]
					}
					break
				}
			}
			if latestVersion == "" {
				return fmt.Errorf("failed to parse latest version from GitHub")
			}

			if version != "dev" && latestVersion == version {
				fmt.Fprintf(os.Stderr, "Already up to date (%s)\n", version)
				return nil
			}

			binaryName := fmt.Sprintf("whip-%s-%s", runtime.GOOS, runtime.GOARCH)
			downloadURL := fmt.Sprintf("https://github.com/%s/releases/download/%s/%s",
				repo, latestVersion, binaryName)

			binPath, err := os.Executable()
			if err != nil {
				binPath = filepath.Join(os.Getenv("HOME"), ".local", "bin", "whip")
			}
			if resolved, err := filepath.EvalSymlinks(binPath); err == nil {
				binPath = resolved
			}

			fmt.Fprintf(os.Stderr, "Downloading %s...\n", latestVersion)
			dlCmd := exec.Command("curl", "-fsSL", "-o", binPath, downloadURL)
			dlCmd.Stderr = os.Stderr
			if err := dlCmd.Run(); err != nil {
				return fmt.Errorf("download failed: %w", err)
			}

			if err := os.Chmod(binPath, 0755); err != nil {
				return fmt.Errorf("chmod failed: %w", err)
			}

			fmt.Fprintf(os.Stderr, "Updated to %s\n", latestVersion)
			return nil
		},
	}
}

func versionCmd() *cobra.Command {
	return &cobra.Command{
		Use:   "version",
		Short: "Print version",
		Args:  cobra.NoArgs,
		Run: func(cmd *cobra.Command, args []string) {
			fmt.Println(version)
		},
	}
}

// resolveDescription reads description from --desc, --file, or stdin.
func resolveDescription(desc, file string) (string, error) {
	if desc != "" {
		return desc, nil
	}
	if file != "" {
		data, err := os.ReadFile(file)
		if err != nil {
			return "", fmt.Errorf("cannot read description file: %w", err)
		}
		return strings.TrimSpace(string(data)), nil
	}

	// Try stdin
	stat, _ := os.Stdin.Stat()
	if (stat.Mode() & os.ModeCharDevice) == 0 {
		data, err := io.ReadAll(os.Stdin)
		if err != nil {
			return "", fmt.Errorf("cannot read stdin: %w", err)
		}
		content := strings.TrimSpace(string(data))
		if content != "" {
			return content, nil
		}
	}

	return "", nil
}

func truncate(s string, max int) string {
	if len(s) <= max {
		return s
	}
	if max <= 3 {
		return s[:max]
	}
	return s[:max-2] + ".."
}

func timeAgo(t time.Time) string {
	d := time.Since(t)
	switch {
	case d < time.Minute:
		return "just now"
	case d < time.Hour:
		return fmt.Sprintf("%dm ago", int(d.Minutes()))
	case d < 24*time.Hour:
		return fmt.Sprintf("%dh ago", int(d.Hours()))
	default:
		return fmt.Sprintf("%dd ago", int(d.Hours()/24))
	}
}
