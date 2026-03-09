package main

import (
	"context"
	"fmt"
	"os"
	"os/exec"
	"os/signal"
	"strings"
	"syscall"

	"github.com/bang9/ai-tools/whip/internal/whip"
	"github.com/spf13/cobra"
	"golang.org/x/term"
)

func remoteCmd() *cobra.Command {
	var backend, difficulty, tunnel, workspace, authMode string
	var port int

	cmd := &cobra.Command{
		Use:   "remote",
		Short: "Start master session with IRC serve",
		Args:  cobra.NoArgs,
		RunE: func(cmd *cobra.Command, args []string) error {
			if _, err := exec.LookPath("tmux"); err != nil {
				return fmt.Errorf("tmux is required but not installed\n\nInstall with:\n  brew install tmux    (macOS)\n  apt install tmux     (Ubuntu/Debian)\n  pacman -S tmux       (Arch)")
			}

			store, err := whip.NewStore()
			if err != nil {
				return err
			}

			cfg, err := store.LoadConfig()
			if err != nil {
				return err
			}

			if !cmd.Flags().Changed("tunnel") && cfg.Tunnel != "" {
				tunnel = cfg.Tunnel
			}
			if !cmd.Flags().Changed("port") && cfg.RemotePort > 0 {
				port = cfg.RemotePort
			}
			if !cmd.Flags().Changed("auth-mode") {
				authMode = whip.NormalizeRemoteAuthMode(cfg.RemoteAuthMode)
			}
			if err := whip.ValidateRemoteAuthMode(authMode); err != nil {
				return err
			}
			authMode = whip.NormalizeRemoteAuthMode(authMode)
			if authMode == whip.RemoteAuthModeDevice && cmd.Flags().Changed("new-token") {
				return fmt.Errorf("--new-token is only supported with --auth-mode=%s", whip.RemoteAuthModeToken)
			}
			if err := whip.ValidateWorkspaceName(workspace); err != nil {
				return err
			}

			cwd, err := os.Getwd()
			if err != nil {
				return fmt.Errorf("cannot determine working directory: %w", err)
			}

			remoteCfg := whip.RemoteConfig{
				Backend:    backend,
				Difficulty: difficulty,
				Tunnel:     tunnel,
				Port:       port,
				CWD:        cwd,
				Workspace:  whip.NormalizeWorkspaceName(workspace),
				AuthMode:   authMode,
			}
			masterSession := whip.WorkspaceMasterSessionName(remoteCfg.Workspace)

			if whip.IsMasterSessionAlive(remoteCfg.Workspace) {
				fmt.Fprintf(os.Stderr, "Master session already running (%s)\n", masterSession)
				fmt.Fprintf(os.Stderr, "Attach with: tmux attach -t %s\n", masterSession)
			} else {
				fmt.Fprintln(os.Stderr, "Spawning master session...")
				if err := whip.SpawnMasterSession(remoteCfg); err != nil {
					return fmt.Errorf("failed to spawn master session: %w", err)
				}
				fmt.Fprintf(os.Stderr, "Master session started (%s)\n", masterSession)
			}

			ctx, cancel := context.WithCancel(context.Background())
			defer cancel()

			serveToken := cfg.ServeToken
			if authMode != whip.RemoteAuthModeToken {
				serveToken = ""
			} else if cmd.Flags().Changed("new-token") {
				serveToken = ""
			}

			fmt.Fprintln(os.Stderr, "Starting claude-irc serve...")
			serveCmd, serveResult, err := whip.StartServe(ctx, remoteCfg, serveToken, true, func(line string) {
				fmt.Fprintf(os.Stderr, "\n  %s\n", line)
			})
			if err != nil {
				return fmt.Errorf("failed to start serve: %w", err)
			}

			connectURL := serveResult.ConnectURL
			shortURL := serveResult.ShortURL

			fmt.Fprintln(os.Stderr, "")
			if shortURL != "" {
				fmt.Fprintf(os.Stderr, "  URL: %s\n", shortURL)
			} else if connectURL != "" {
				fmt.Fprintf(os.Stderr, "  URL: %s\n", connectURL)
			}
			fmt.Fprintf(os.Stderr, "  Auth mode:     %s\n", authMode)
			fmt.Fprintf(os.Stderr, "  Workspace:     %s\n", remoteCfg.Workspace)
			fmt.Fprintf(os.Stderr, "  Master tmux:   tmux attach -t %s\n", masterSession)
			fmt.Fprintln(os.Stderr, "")
			fmt.Fprintln(os.Stderr, "  Shortcuts: [o] open in browser  [c] copy URL  [q] quit")

			tokenFromURL := connectURLToken(connectURL)
			if _, err := store.UpdateConfig(func(cfg *whip.Config) error {
				cfg.Tunnel = tunnel
				cfg.RemotePort = port
				cfg.RemoteAuthMode = authMode
				if tokenFromURL != "" {
					cfg.ServeToken = tokenFromURL
				}
				return nil
			}); err != nil {
				fmt.Fprintf(os.Stderr, "Warning: save config: %v\n", err)
			}

			sigCh := make(chan os.Signal, 1)
			signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)

			quitCh := make(chan struct{})
			primaryURL := shortURL
			if primaryURL == "" {
				primaryURL = connectURL
			}
			go remoteKeyboardLoop(primaryURL, quitCh)

			select {
			case <-sigCh:
			case <-quitCh:
			}

			fmt.Fprintln(os.Stderr, "\nStopping serve...")
			cancel()
			if serveCmd.Process != nil {
				_ = serveCmd.Process.Signal(syscall.SIGTERM)
				_ = serveCmd.Wait()
			}

			fmt.Fprintf(os.Stderr, "Serve stopped. Master session persists — reattach with: tmux attach -t %s\n", masterSession)
			return nil
		},
	}

	cmd.Flags().StringVar(&backend, "backend", "claude", "AI backend (claude or codex)")
	cmd.Flags().StringVar(&difficulty, "difficulty", "hard", "Task difficulty (hard, medium, easy)")
	cmd.Flags().StringVar(&tunnel, "tunnel", "", "Cloudflare tunnel hostname")
	cmd.Flags().IntVar(&port, "port", 8585, "Serve port")
	cmd.Flags().StringVar(&workspace, "workspace", "", "Workspace name (default: global)")
	cmd.Flags().StringVar(&authMode, "auth-mode", whip.RemoteAuthModeToken, "Remote auth mode (token or device)")
	cmd.Flags().Bool("new-token", false, "Generate a new auth token (discard saved token)")

	return cmd
}

func remoteKeyboardLoop(primaryURL string, quit chan struct{}) {
	fd := int(os.Stdin.Fd())
	old, err := term.MakeRaw(fd)
	if err != nil {
		select {}
	}
	defer term.Restore(fd, old)

	buf := make([]byte, 1)
	for {
		n, err := os.Stdin.Read(buf)
		if err != nil || n == 0 {
			return
		}
		switch buf[0] {
		case 'q', 'Q':
			close(quit)
			return
		case 'o', 'O':
			if primaryURL != "" {
				exec.Command("open", primaryURL).Start()
			}
		case 'c', 'C':
			if primaryURL != "" {
				c := exec.Command("pbcopy")
				c.Stdin = strings.NewReader(primaryURL)
				c.Run()
				fmt.Fprintln(os.Stderr, "  URL copied to clipboard")
			}
		}
	}
}
