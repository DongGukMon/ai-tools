package main

import (
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"text/tabwriter"
	"time"

	"github.com/bang9/ai-tools/claude-irc/internal/irc"
	"github.com/spf13/cobra"
)

var (
	nameFlag string

	// Set via -ldflags at build time
	version = "dev"
)

func main() {
	root := &cobra.Command{
		Use:     "claude-irc",
		Short:   "IRC-inspired inter-session communication for Claude Code",
		Version: version,
	}

	root.PersistentFlags().StringVar(&nameFlag, "name", "", "Override peer name (bypass session marker)")

	root.AddCommand(
		joinCmd(),
		whoCmd(),
		msgCmd(),
		inboxCmd(),
		checkCmd(),
		topicCmd(),
		boardCmd(),
		quitCmd(),
		daemonCmd(),
		upgradeCmd(),
	)

	if err := root.Execute(); err != nil {
		os.Exit(1)
	}
}

func joinCmd() *cobra.Command {
	return &cobra.Command{
		Use:   "join <name>",
		Short: "Join the channel with a peer name",
		Args:  cobra.ExactArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			name := args[0]

			store, err := irc.NewStore()
			if err != nil {
				return err
			}

			sessionPID := os.Getppid()

			// Register in registry
			if err := store.Register(name, sessionPID); err != nil {
				return err
			}

			// Spawn daemon for online presence
			daemonPID, err := store.SpawnDaemon(name, sessionPID)
			if err != nil {
				store.Unregister(name)
				return fmt.Errorf("failed to spawn daemon: %w", err)
			}

			// Update daemon PID in registry
			store.SetDaemonPID(name, daemonPID)

			// Write session marker for hook detection
			if err := store.WriteSessionMarker(name, sessionPID); err != nil {
				store.KillDaemon(name)
				store.Unregister(name)
				return fmt.Errorf("failed to write session marker: %w", err)
			}

			fmt.Fprintf(os.Stderr, "Joined as '%s' (daemon pid: %d)\n", name, daemonPID)
			return nil
		},
	}
}

func whoCmd() *cobra.Command {
	return &cobra.Command{
		Use:   "who",
		Short: "List peers with online/offline status",
		Args:  cobra.NoArgs,
		RunE: func(cmd *cobra.Command, args []string) error {
			store, err := irc.NewStore()
			if err != nil {
				return err
			}

			statuses, err := store.CheckAllPresence()
			if err != nil {
				return err
			}

			if len(statuses) == 0 {
				fmt.Println("No peers connected.")
				return nil
			}

			w := tabwriter.NewWriter(os.Stdout, 0, 0, 2, ' ', 0)
			fmt.Fprintln(w, "PEER\tSTATUS\tSINCE\tCWD")
			for _, s := range statuses {
				status := "offline"
				if s.Online {
					status = "online"
				}
				since := timeAgo(s.RegisteredAt)
				fmt.Fprintf(w, "%s\t%s\t%s\t%s\n", s.Name, status, since, s.CWD)
			}
			w.Flush()
			return nil
		},
	}
}

func msgCmd() *cobra.Command {
	return &cobra.Command{
		Use:   "msg <peer> <message>",
		Short: "Send a message to a peer",
		Args:  cobra.ExactArgs(2),
		RunE: func(cmd *cobra.Command, args []string) error {
			peer, content := args[0], args[1]

			store, err := irc.NewStore()
			if err != nil {
				return err
			}

			from, err := resolveMyName(store)
			if err != nil {
				return err
			}

			if err := store.SendMessage(peer, from, content); err != nil {
				return err
			}

			fmt.Fprintf(os.Stderr, "Message sent to '%s'\n", peer)
			return nil
		},
	}
}

func inboxCmd() *cobra.Command {
	return &cobra.Command{
		Use:   "inbox",
		Short: "Show received messages",
		Args:  cobra.NoArgs,
		RunE: func(cmd *cobra.Command, args []string) error {
			store, err := irc.NewStore()
			if err != nil {
				return err
			}

			name, err := resolveMyName(store)
			if err != nil {
				return err
			}

			messages, err := store.ReadInbox(name)
			if err != nil {
				return err
			}

			if len(messages) == 0 {
				fmt.Println("No messages.")
				return nil
			}

			w := tabwriter.NewWriter(os.Stdout, 0, 0, 2, ' ', 0)
			fmt.Fprintln(w, "#\tFROM\tTIME\tSTATUS\tMESSAGE")
			for i, msg := range messages {
				status := "unread"
				if msg.Read {
					status = "read"
				}
				preview := msg.Content
				if len(preview) > 80 {
					preview = preview[:77] + "..."
				}
				fmt.Fprintf(w, "%d\t%s\t%s\t%s\t%s\n",
					i+1, msg.From, timeAgo(msg.Timestamp), status, preview)
			}
			w.Flush()

			// Mark all as read
			store.MarkAllRead(name)

			return nil
		},
	}
}

func checkCmd() *cobra.Command {
	var quiet bool
	cmd := &cobra.Command{
		Use:   "check",
		Short: "Check for unread messages (hook-friendly)",
		Args:  cobra.NoArgs,
		RunE: func(cmd *cobra.Command, args []string) error {
			ppid := os.Getppid()

			// Fast path: scan for session marker without running git
			store, name, err := irc.DetectSession(ppid)
			if err != nil {
				return nil // Not joined, exit silently
			}

			unread, err := store.UnreadMessages(name)
			if err != nil || len(unread) == 0 {
				return nil // No messages, exit silently
			}

			if quiet {
				// Hook mode: print messages inline for Claude to see
				for _, msg := range unread {
					fmt.Printf("[claude-irc] %s: %s\n", msg.From, msg.Content)
				}
			} else {
				fmt.Printf("%d unread message(s):\n", len(unread))
				for _, msg := range unread {
					fmt.Printf("  [%s] %s: %s\n",
						msg.Timestamp.Format("15:04"), msg.From, msg.Content)
				}
			}

			// Mark as read after displaying
			store.MarkAllRead(name)

			return nil
		},
	}
	cmd.Flags().BoolVar(&quiet, "quiet", false, "Minimal output for hook integration")
	return cmd
}

func topicCmd() *cobra.Command {
	return &cobra.Command{
		Use:   "topic <title>",
		Short: "Publish a context topic (reads content from stdin)",
		Args:  cobra.ExactArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			title := args[0]

			store, err := irc.NewStore()
			if err != nil {
				return err
			}

			name, err := resolveMyName(store)
			if err != nil {
				return err
			}

			content, err := io.ReadAll(os.Stdin)
			if err != nil {
				return fmt.Errorf("failed to read stdin: %w", err)
			}

			if err := store.PublishTopic(name, title, string(content)); err != nil {
				return err
			}

			fmt.Fprintf(os.Stderr, "Published: \"%s\"\n", title)
			return nil
		},
	}
}

func boardCmd() *cobra.Command {
	return &cobra.Command{
		Use:   "board <peer> [index]",
		Short: "Read a peer's published topics",
		Args:  cobra.RangeArgs(1, 2),
		RunE: func(cmd *cobra.Command, args []string) error {
			peer := args[0]

			store, err := irc.NewStore()
			if err != nil {
				return err
			}

			// If index is given, show specific topic
			if len(args) == 2 {
				index, err := strconv.Atoi(args[1])
				if err != nil {
					return fmt.Errorf("invalid index: %s", args[1])
				}

				topic, err := store.GetTopic(peer, index)
				if err != nil {
					return err
				}

				fmt.Printf("[%s] %s (%s)\n\n%s\n",
					peer, topic.Title, timeAgo(topic.Timestamp), topic.Content)
				return nil
			}

			// List all topics
			topics, err := store.ListTopics(peer)
			if err != nil {
				return err
			}

			if len(topics) == 0 {
				fmt.Printf("No topics from '%s'.\n", peer)
				return nil
			}

			w := tabwriter.NewWriter(os.Stdout, 0, 0, 2, ' ', 0)
			fmt.Fprintln(w, "#\tTITLE\tTIME")
			for i, t := range topics {
				fmt.Fprintf(w, "%d\t%s\t%s\n", i+1, t.Title, timeAgo(t.Timestamp))
			}
			w.Flush()
			return nil
		},
	}
}

func quitCmd() *cobra.Command {
	return &cobra.Command{
		Use:   "quit",
		Short: "Leave the channel and clean up",
		Args:  cobra.NoArgs,
		RunE: func(cmd *cobra.Command, args []string) error {
			ppid := os.Getppid()

			store, name, err := irc.DetectSession(ppid)
			if err != nil {
				// Try NewStore as fallback
				store, err = irc.NewStore()
				if err != nil {
					return nil // Nothing to do
				}
				// Try to read marker with store
				name, err = store.ReadSessionMarker(ppid)
				if err != nil {
					return nil // Not joined
				}
			}

			// Kill daemon
			store.KillDaemon(name)

			// Remove session marker
			store.RemoveSessionMarker(ppid)

			// Unregister from registry
			store.Unregister(name)

			fmt.Fprintf(os.Stderr, "Left as '%s'. Goodbye!\n", name)
			return nil
		},
	}
}

func daemonCmd() *cobra.Command {
	var name string
	var sessionPID int

	cmd := &cobra.Command{
		Use:    "__daemon",
		Hidden: true,
		RunE: func(cmd *cobra.Command, args []string) error {
			store, err := irc.NewStore()
			if err != nil {
				return err
			}
			return store.RunDaemon(name, sessionPID)
		},
	}

	cmd.Flags().StringVar(&name, "name", "", "Peer name")
	cmd.Flags().IntVar(&sessionPID, "session-pid", 0, "Parent session PID to monitor")
	cmd.MarkFlagRequired("name")

	return cmd
}

// resolveMyName determines the current peer's name.
// Priority: --name flag > PPID session marker > single registered peer.
func resolveMyName(store *irc.Store) (string, error) {
	if nameFlag != "" {
		return nameFlag, nil
	}

	name, err := store.ReadSessionMarker(os.Getppid())
	if err == nil && name != "" {
		return name, nil
	}

	// Fallback: if only one peer exists, assume it's us
	peers, err := store.ListPeers()
	if err == nil && len(peers) == 1 {
		for n := range peers {
			return n, nil
		}
	}

	return "", fmt.Errorf("not joined (run 'claude-irc join <name>' first, or use --name)")
}

func upgradeCmd() *cobra.Command {
	return &cobra.Command{
		Use:   "upgrade",
		Short: "Upgrade claude-irc to the latest version",
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

			binaryName := fmt.Sprintf("claude-irc-%s-%s", runtime.GOOS, runtime.GOARCH)

			downloadURL := fmt.Sprintf("https://github.com/%s/releases/download/%s/%s", repo, latestVersion, binaryName)

			binPath, err := os.Executable()
			if err != nil {
				binPath = filepath.Join(os.Getenv("HOME"), ".local", "bin", "claude-irc")
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

// timeAgo returns a human-readable relative time string.
func timeAgo(t time.Time) string {
	d := time.Since(t)
	switch {
	case d < time.Minute:
		return "just now"
	case d < time.Hour:
		m := int(d.Minutes())
		return fmt.Sprintf("%dm ago", m)
	case d < 24*time.Hour:
		h := int(d.Hours())
		return fmt.Sprintf("%dh ago", h)
	default:
		days := int(d.Hours() / 24)
		return fmt.Sprintf("%dd ago", days)
	}
}
