package main

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"text/tabwriter"
	"time"

	irc "github.com/bang9/ai-tools/shared/irclib"
	"github.com/spf13/cobra"
)

func joinCmd() *cobra.Command {
	return &cobra.Command{
		Use:   "join <name>",
		Short: "Join the channel with a peer name",
		Args:  cobra.ExactArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			name := args[0]

			if !irc.IsValidPeerName(name) {
				return fmt.Errorf("invalid peer name '%s': only letters, numbers, hyphens, and underscores allowed (max 32 chars)", name)
			}

			store, err := irc.NewStore()
			if err != nil {
				return err
			}

			sessionPID := irc.FindSessionPID(os.Getppid())

			if err := store.Register(name, sessionPID); err != nil {
				if errors.Is(err, irc.ErrAlreadyJoined) {
					fmt.Fprintf(os.Stderr, "Already joined as '%s'\n", name)
					return nil
				}
				return err
			}

			daemonPID, err := store.SpawnDaemon(name, sessionPID)
			if err != nil {
				store.Unregister(name)
				return fmt.Errorf("failed to spawn daemon: %w", err)
			}

			store.SetDaemonPID(name, daemonPID)

			if err := store.WriteSessionMarker(name, daemonPID, sessionPID); err != nil {
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

			store.CleanOrphanDirs()

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

func whoamiCmd() *cobra.Command {
	return &cobra.Command{
		Use:   "whoami",
		Short: "Print the current session identity",
		Args:  cobra.NoArgs,
		RunE: func(cmd *cobra.Command, args []string) error {
			store, err := irc.NewStore()
			if err != nil {
				return err
			}

			name, err := resolveMyName(store)
			if err != nil {
				fmt.Fprintln(cmd.OutOrStdout(), "not joined")
				return nil
			}

			fmt.Fprintln(cmd.OutOrStdout(), name)
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

			if !irc.IsValidPeerName(peer) {
				return fmt.Errorf("invalid peer name '%s'", peer)
			}
			if strings.TrimSpace(content) == "" {
				return fmt.Errorf("message cannot be empty")
			}
			if len(content) > 10240 {
				return fmt.Errorf("message too large (%d bytes, max 10KB)", len(content))
			}

			store, err := irc.NewStore()
			if err != nil {
				return err
			}

			from, err := resolveMyName(store)
			if err != nil {
				return err
			}

			if peer == from {
				return fmt.Errorf("cannot send message to yourself")
			}

			if peer != dashboardOperatorName {
				peers, err := store.ListPeers()
				if err != nil {
					return err
				}
				if _, ok := peers[peer]; !ok {
					return fmt.Errorf("peer '%s' not found (use 'who' to list peers)", peer)
				}
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
	var all bool
	cmd := &cobra.Command{
		Use:   "inbox [index|clear]",
		Short: "Show unread messages (use index to read full, 'clear' to delete all)",
		Args:  cobra.MaximumNArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			store, err := irc.NewStore()
			if err != nil {
				return err
			}

			name, err := resolveMyName(store)
			if err != nil {
				return err
			}

			if len(args) == 1 && args[0] == "clear" {
				if err := store.ClearInbox(name); err != nil {
					return err
				}
				fmt.Fprintln(os.Stderr, "Inbox cleared.")
				return nil
			}

			messages, err := store.ReadInbox(name)
			if err != nil {
				return err
			}

			if len(args) == 1 {
				index, err := strconv.Atoi(args[0])
				if err != nil || index < 1 || index > len(messages) {
					return fmt.Errorf("invalid index: %s (1-%d)", args[0], len(messages))
				}
				msg := messages[index-1]
				fmt.Printf("[%s] %s\n\n%s\n", msg.From, timeAgo(msg.Timestamp), msg.Content)
				store.MarkAllRead(name)
				return nil
			}

			type indexedMsg struct {
				index int
				msg   irc.Message
			}
			var display []indexedMsg
			for i, msg := range messages {
				if all || !msg.Read {
					display = append(display, indexedMsg{index: i + 1, msg: msg})
				}
			}

			if len(display) == 0 {
				fmt.Println("No messages.")
				return nil
			}

			w := tabwriter.NewWriter(os.Stdout, 0, 0, 2, ' ', 0)
			fmt.Fprintln(w, "#\tFROM\tTIME\tMESSAGE")
			for _, d := range display {
				preview := strings.ReplaceAll(d.msg.Content, "\n", " ")
				if len(preview) > 80 {
					preview = preview[:77] + "..."
				}
				fmt.Fprintf(w, "%d\t%s\t%s\t%s\n",
					d.index, d.msg.From, timeAgo(d.msg.Timestamp), preview)
			}
			w.Flush()

			store.MarkAllRead(name)
			return nil
		},
	}
	cmd.Flags().BoolVar(&all, "all", false, "Show all messages including read")
	cmd.Flags().SetInterspersed(false)
	cmd.FParseErrWhitelist = cobra.FParseErrWhitelist{UnknownFlags: true}
	return cmd
}

func quitCmd() *cobra.Command {
	return &cobra.Command{
		Use:   "quit",
		Short: "Leave the channel and clean up",
		Args:  cobra.NoArgs,
		RunE: func(cmd *cobra.Command, args []string) error {
			store, err := irc.NewStore()
			if err != nil {
				return nil
			}

			name, err := resolveMyName(store)
			if err != nil {
				return fmt.Errorf("not joined (nothing to quit)")
			}

			store.KillDaemon(name)
			cleanSessionMarkers(store, name)
			store.Unregister(name)

			fmt.Fprintf(os.Stderr, "Left as '%s'. Goodbye!\n", name)
			return nil
		},
	}
}

func cleanCmd() *cobra.Command {
	return &cobra.Command{
		Use:   "clean",
		Short: "Remove all offline/stale peers",
		Args:  cobra.NoArgs,
		RunE: func(cmd *cobra.Command, args []string) error {
			store, err := irc.NewStore()
			if err != nil {
				return nil
			}
			statuses, err := store.CheckAllPresence()
			if err != nil {
				return err
			}
			store.CleanOrphanDirs()
			cleaned := 0
			for _, s := range statuses {
				if !s.Online {
					cleaned++
				}
			}
			if cleaned > 0 {
				fmt.Fprintf(os.Stderr, "Cleaned %d stale peer(s)\n", cleaned)
			}
			return nil
		},
	}
}

func cleanSessionMarkers(store *irc.Store, name string) {
	entries, err := os.ReadDir(store.BaseDir)
	if err != nil {
		return
	}
	for _, e := range entries {
		if !strings.HasPrefix(e.Name(), ".session_") {
			continue
		}
		path := filepath.Join(store.BaseDir, e.Name())
		data, err := os.ReadFile(path)
		if err != nil {
			continue
		}
		content := strings.TrimSpace(string(data))
		peerName := strings.SplitN(content, "\n", 2)[0]
		if strings.TrimSpace(peerName) == name {
			os.Remove(path)
		}
	}
}

func resolveMyName(store *irc.Store) (string, error) {
	_, detected, detectErr := detectSession(os.Getppid())

	if nameFlag != "" {
		if detectErr == nil && detected != "" && detected != nameFlag {
			return "", fmt.Errorf("--name '%s' does not match your session '%s'", nameFlag, detected)
		}
		if detectErr != nil || detected == "" {
			if nameFlag != "user" {
				return "", fmt.Errorf("--name '%s' not allowed without an active session (only 'user' is permitted)", nameFlag)
			}
		}
		return nameFlag, nil
	}

	if detectErr == nil && detected != "" {
		return detected, nil
	}

	return "", fmt.Errorf("not joined (run 'claude-irc join <name>' first, or use --name)")
}

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
