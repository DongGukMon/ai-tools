package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"os/exec"
	"os/signal"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"syscall"
	"text/tabwriter"
	"time"

	"github.com/bang9/ai-tools/claude-irc/internal/irc"
	"github.com/bang9/ai-tools/shared/upgrade"
	"github.com/spf13/cobra"
	"golang.org/x/term"
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
		msgCmd(),
		inboxCmd(),
		checkCmd(),
		watchCmd(),
		topicCmd(),
		boardCmd(),
		quitCmd(),
		daemonCmd(),
		upgradeCmd(),
		serveCmd(),
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

			if !isValidPeerName(name) {
				return fmt.Errorf("invalid peer name '%s': only letters, numbers, hyphens, and underscores allowed (max 32 chars)", name)
			}

			store, err := irc.NewStore()
			if err != nil {
				return err
			}

			sessionPID := irc.FindSessionPID(os.Getppid())

			// Register in registry
			if err := store.Register(name, sessionPID); err != nil {
				if errors.Is(err, irc.ErrAlreadyJoined) {
					fmt.Fprintf(os.Stderr, "Already joined as '%s'\n", name)
					return nil
				}
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

			// Clean up orphan inbox/topics directories
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

func msgCmd() *cobra.Command {
	return &cobra.Command{
		Use:   "msg <peer> <message>",
		Short: "Send a message to a peer",
		Args:  cobra.ExactArgs(2),
		RunE: func(cmd *cobra.Command, args []string) error {
			peer, content := args[0], args[1]

			if !isValidPeerName(peer) {
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

			if peer == "user" {
				return fmt.Errorf("'user' is a send-only observer and cannot receive messages")
			}

			// Verify peer exists in registry
			peers, err := store.ListPeers()
			if err != nil {
				return err
			}
			if _, ok := peers[peer]; !ok {
				return fmt.Errorf("peer '%s' not found (use 'who' to list peers)", peer)
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

			// Handle "inbox clear"
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

			// Read specific message by index
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

			// Build display list: indices always refer to the full message list
			type indexedMsg struct {
				index int // 1-based position in full message list
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
	cmd.FParseErrWhitelist = cobra.FParseErrWhitelist{UnknownFlags: true} // Allow "inbox -1"
	return cmd
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
				// Hook mode: output structured JSON for Claude Code PreToolUse hook
				// Plain stdout is NOT visible to the agent; additionalContext is.
				var lines []string
				for _, msg := range unread {
					lines = append(lines, fmt.Sprintf("[claude-irc] %s: %s", msg.From, msg.Content))
				}
				hookOutput := map[string]interface{}{
					"hookSpecificOutput": map[string]interface{}{
						"hookEventName":     "PreToolUse",
						"additionalContext": strings.Join(lines, "\n"),
					},
				}
				json.NewEncoder(os.Stdout).Encode(hookOutput)
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

func watchCmd() *cobra.Command {
	var interval int
	cmd := &cobra.Command{
		Use:   "watch",
		Short: "One-shot watcher: print unread, mark read, exit; restart for the next batch",
		Long: `Checks for unread messages immediately, then polls every N seconds until
at least one unread message exists.

When unread messages are found, watch:
  1. Prints all unread messages to stdout
  2. Marks them as read
  3. Exits with code 0

This is a one-shot watcher, not a continuous stream. Restart it after each
task-notification if you want ongoing monitoring.

Recommended conversational loop:
  1. Start watch in the background
  2. When it exits with unread messages, immediately start a new watch
  3. Then read/process/respond while the new watch waits for the next batch

Designed for use as a Claude Code background task:
  claude-irc watch --interval 10
  claude-irc --name my-session watch --interval 10

Use --name when running watch outside the exact shell/process tree that ran
'claude-irc join', otherwise session auto-detection may fail.`,
		Args: cobra.NoArgs,
		RunE: func(cmd *cobra.Command, args []string) error {
			ppid := os.Getppid()

			store, name, err := irc.DetectSession(ppid)
			if err != nil {
				return fmt.Errorf("not joined (run 'claude-irc join <name>' first)")
			}

			ticker := time.NewTicker(time.Duration(interval) * time.Second)
			defer ticker.Stop()

			// Check immediately on start
			if msgs, err := store.UnreadMessages(name); err == nil && len(msgs) > 0 {
				for _, msg := range msgs {
					fmt.Printf("[%s] %s\n", msg.From, msg.Content)
				}
				store.MarkAllRead(name)
				return nil
			}

			for range ticker.C {
				msgs, err := store.UnreadMessages(name)
				if err != nil || len(msgs) == 0 {
					continue
				}
				for _, msg := range msgs {
					fmt.Printf("[%s] %s\n", msg.From, msg.Content)
				}
				store.MarkAllRead(name)
				return nil
			}

			return nil
		},
	}
	cmd.Flags().IntVar(&interval, "interval", 10, "Polling interval in seconds after the immediate unread check")
	return cmd
}

func topicCmd() *cobra.Command {
	var deleteIndex int
	var clear bool
	cmd := &cobra.Command{
		Use:   "topic [title]",
		Short: "Publish, delete, or clear topics",
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

			// Handle --clear
			if clear {
				if err := store.ClearTopics(name); err != nil {
					return err
				}
				fmt.Fprintln(os.Stderr, "All topics cleared.")
				return nil
			}

			// Handle --delete <index>
			if cmd.Flags().Changed("delete") {
				if deleteIndex < 1 {
					return fmt.Errorf("invalid topic index: %d (must be >= 1)", deleteIndex)
				}
				topic, err := store.GetTopic(name, deleteIndex)
				if err != nil {
					return err
				}
				if err := store.DeleteTopic(name, deleteIndex); err != nil {
					return err
				}
				fmt.Fprintf(os.Stderr, "Deleted topic #%d: \"%s\"\n", deleteIndex, topic.Title)
				return nil
			}

			// Publish: requires title arg + stdin
			if len(args) == 0 {
				return fmt.Errorf("usage: topic <title> (pipe content via stdin), topic --delete <index>, or topic --clear")
			}

			title := args[0]
			if strings.TrimSpace(title) == "" {
				return fmt.Errorf("topic title cannot be empty")
			}

			content, err := io.ReadAll(os.Stdin)
			if err != nil {
				return fmt.Errorf("failed to read stdin: %w", err)
			}

			contentStr := strings.TrimSpace(string(content))
			if contentStr == "" {
				return fmt.Errorf("topic content cannot be empty (pipe content via stdin)")
			}
			if len(contentStr) > 51200 {
				return fmt.Errorf("topic too large (%d bytes, max 50KB)", len(contentStr))
			}

			if err := store.PublishTopic(name, title, contentStr); err != nil {
				return err
			}

			fmt.Fprintf(os.Stderr, "Published: \"%s\"\n", title)
			return nil
		},
	}
	cmd.Flags().IntVar(&deleteIndex, "delete", 0, "Delete topic by index")
	cmd.Flags().BoolVar(&clear, "clear", false, "Delete all your topics")
	return cmd
}

func boardCmd() *cobra.Command {
	cmd := &cobra.Command{
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
	cmd.Flags().SetInterspersed(false) // Allow "board peer -1" without flag parsing
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
				return nil // No store dir — nothing to quit
			}

			name, err := resolveMyName(store)
			if err != nil {
				return fmt.Errorf("not joined (nothing to quit)")
			}

			// Kill daemon
			store.KillDaemon(name)

			// Remove session markers (clean all markers pointing to this name)
			cleanSessionMarkers(store, name)

			// Unregister from registry
			store.Unregister(name)

			fmt.Fprintf(os.Stderr, "Left as '%s'. Goodbye!\n", name)
			return nil
		},
	}
}

// cleanSessionMarkers removes all session marker files that point to the given name.
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
		if strings.TrimSpace(string(data)) == name {
			os.Remove(path)
		}
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
// Priority: session marker > --name fallback > single registered peer.
// --name is only allowed when session detection fails (prevents impersonation).
func resolveMyName(store *irc.Store) (string, error) {
	// Try session detection first
	_, detected, detectErr := detectSession(os.Getppid())

	if nameFlag != "" {
		// --name provided: only allow if session detection fails or matches
		if detectErr == nil && detected != "" && detected != nameFlag {
			return "", fmt.Errorf("--name '%s' does not match your session '%s'", nameFlag, detected)
		}
		if detectErr != nil || detected == "" {
			// No active session: only allow reserved observer name
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

// isValidPeerName checks that a peer name contains only safe characters.
func isValidPeerName(name string) bool {
	if name == "" || len(name) > 32 {
		return false
	}
	for _, c := range name {
		if !((c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9') || c == '-' || c == '_') {
			return false
		}
	}
	return true
}

func serveCmd() *cobra.Command {
	var port int
	var tunnel string

	cmd := &cobra.Command{
		Use:   "serve",
		Short: "Start HTTP API server for external access",
		Long:  "Starts an HTTP API server that wraps the local claude-irc store, with optional cloudflared tunnel for remote access.",
		Args:  cobra.NoArgs,
		RunE: func(cmd *cobra.Command, args []string) error {
			store, err := irc.NewStore()
			if err != nil {
				return err
			}

			ctx, cancel := context.WithCancel(context.Background())
			defer cancel()

			// Signal handling
			sigCh := make(chan os.Signal, 1)
			signal.Notify(sigCh, syscall.SIGTERM, syscall.SIGINT)
			go func() { <-sigCh; cancel() }()

			// Optional tunnel
			var tunnelMgr *irc.TunnelManager
			var publicURL string
			if cmd.Flags().Changed("tunnel") {
				tunnelMgr = irc.NewTunnelManager(tunnel, port)
				var err error
				publicURL, err = tunnelMgr.Start(ctx)
				if err != nil {
					return fmt.Errorf("tunnel: %w", err)
				}
				defer tunnelMgr.Stop()
			}

			return irc.RunServer(ctx, irc.ServerConfig{
				Port:  port,
				Store: store,
				OnReady: func(info irc.ServerInfo) {
					connectURL := info.LocalURL
					if publicURL != "" {
						connectURL = publicURL
					}
					fullURL := fmt.Sprintf("%s?token=%s", connectURL, info.Token)
					webURL := fmt.Sprintf("https://whip.bang9.dev?url=%s", fullURL)
					fmt.Fprintf(os.Stderr, "claude-irc serve started.\n")
					fmt.Fprintf(os.Stderr, "Connect URL: %s\n", fullURL)
					if keyboardShortcutsAvailable() {
						fmt.Fprintf(os.Stderr, "\nShortcuts: [o] open in browser  [c] copy URL  [q] quit\n")
						go serveKeyboardLoop(ctx, webURL, fullURL, cancel)
					}
				},
			})
		},
	}

	cmd.Flags().IntVar(&port, "port", 8585, "HTTP server port")
	cmd.Flags().StringVar(&tunnel, "tunnel", "", "Cloudflare Tunnel hostname (empty for quick tunnel, or domain like irc.bang9.dev)")
	return cmd
}

type keyboardLoopDeps struct {
	stdin    io.Reader
	stderr   io.Writer
	makeRaw  func() (func(), error)
	openURL  func(string) error
	copyText func(string) error
}

func upgradeCmd() *cobra.Command {
	return &cobra.Command{
		Use:   "upgrade",
		Short: "Upgrade claude-irc to the latest version",
		Args:  cobra.NoArgs,
		RunE: func(cmd *cobra.Command, args []string) error {
			return upgrade.Run(upgrade.Config{
				Repo:       "bang9/ai-tools",
				BinaryName: "claude-irc",
				Version:    version,
			})
		},
	}
}

func keyboardShortcutsAvailable() bool {
	return term.IsTerminal(int(os.Stdin.Fd()))
}

func serveKeyboardLoop(ctx context.Context, webURL, connectURL string, cancel context.CancelFunc) {
	fd := int(os.Stdin.Fd())
	if !term.IsTerminal(fd) {
		return
	}
	serveKeyboardLoopWithDeps(ctx, webURL, connectURL, cancel, keyboardLoopDeps{
		stdin:  os.Stdin,
		stderr: os.Stderr,
		makeRaw: func() (func(), error) {
			state, err := term.MakeRaw(fd)
			if err != nil {
				return nil, err
			}
			return func() {
				_ = term.Restore(fd, state)
			}, nil
		},
		openURL: func(url string) error {
			return exec.Command("open", url).Run()
		},
		copyText: func(text string) error {
			cmd := exec.Command("pbcopy")
			cmd.Stdin = strings.NewReader(text)
			return cmd.Run()
		},
	})
}

func serveKeyboardLoopWithDeps(ctx context.Context, webURL, connectURL string, cancel context.CancelFunc, deps keyboardLoopDeps) {
	restore, err := deps.makeRaw()
	if err != nil {
		fmt.Fprintf(deps.stderr, "\nShortcuts unavailable: %v\n", err)
		return
	}
	var restoreOnce sync.Once
	restoreTerminal := func() {
		restoreOnce.Do(func() {
			if restore != nil {
				restore()
			}
		})
	}
	defer restoreTerminal()
	go func() {
		<-ctx.Done()
		restoreTerminal()
	}()

	buf := make([]byte, 1)
	for {
		n, err := deps.stdin.Read(buf)
		if err != nil || n == 0 {
			return
		}
		switch buf[0] {
		case 'o', 'O':
			if err := deps.openURL(webURL); err != nil {
				fmt.Fprintf(deps.stderr, "\rFailed to open browser: %v\n", err)
				continue
			}
			fmt.Fprintf(deps.stderr, "\rOpened in browser\n")
		case 'c', 'C':
			if err := deps.copyText(connectURL); err != nil {
				fmt.Fprintf(deps.stderr, "\rFailed to copy URL: %v\n", err)
				continue
			}
			fmt.Fprintf(deps.stderr, "\rCopied to clipboard\n")
		case 'q', 'Q', 3: // 3 = Ctrl+C
			fmt.Fprintf(deps.stderr, "\r\n")
			cancel()
			return
		}
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
