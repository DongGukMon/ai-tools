package main

import (
	"context"
	"fmt"
	"io"
	"os"
	"os/exec"
	"os/signal"
	"strings"
	"syscall"

	"github.com/bang9/ai-tools/whip/internal/whip"
	qrterminal "github.com/mdp/qrterminal/v3"
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
			noticePrinter := remoteNoticePrinter{w: os.Stderr}
			serveCmd, serveResult, err := whip.StartServe(ctx, remoteCfg, serveToken, true, func(line string) {
				noticePrinter.Print(line)
			})
			if err != nil {
				return fmt.Errorf("failed to start serve: %w", err)
			}

			connectURL := serveResult.ConnectURL
			shortURL := serveResult.ShortURL
			openURL := serveOpenURL(shortURL)

			fmt.Fprintln(os.Stderr, "")
			if shortURL != "" {
				fmt.Fprintf(os.Stderr, "  Short URL:     %s\n", shortURL)
			}
			fmt.Fprintf(os.Stderr, "  Auth mode:     %s\n", authMode)
			fmt.Fprintf(os.Stderr, "  Workspace:     %s\n", remoteCfg.Workspace)
			fmt.Fprintf(os.Stderr, "  Master tmux:   tmux attach -t %s\n", masterSession)
			fmt.Fprintln(os.Stderr, "")

			qrTarget := shortURL
			if qrTarget == "" {
				qrTarget = serveOpenURL(shortURL)
			}
			if qrTarget != "" {
				qrterminal.Generate(qrTarget, qrterminal.L, os.Stderr)
				fmt.Fprintln(os.Stderr, "")
			}

			fmt.Fprintln(os.Stderr, "  Shortcuts: [o] open short URL  [c] copy connect URL  [q] quit")

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
			go remoteKeyboardLoop(openURL, connectURL, quitCh)

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
	cmd.Flags().StringVar(&authMode, "auth-mode", whip.RemoteAuthModeDevice, "Remote auth mode (token or device)")
	cmd.Flags().Bool("new-token", false, "Generate a new auth token (discard saved token)")

	return cmd
}

func remoteKeyboardLoop(openURL string, connectURL string, quit chan struct{}) {
	fd := int(os.Stdin.Fd())
	old, err := term.MakeRaw(fd)
	if err != nil {
		return
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
			if openURL != "" {
				exec.Command("open", openURL).Start()
				fmt.Fprint(os.Stderr, "\rOpened short URL\r\n")
			}
		case 'c', 'C':
			if connectURL != "" {
				c := exec.Command("pbcopy")
				c.Stdin = strings.NewReader(connectURL)
				c.Run()
				fmt.Fprint(os.Stderr, "\rCopied connect URL\r\n")
			}
		}
	}
}

func serveOpenURL(shortURL string) string {
	return shortURL
}

type remoteNoticePrinter struct {
	w                  io.Writer
	hasActiveChallenge bool
}

func (p *remoteNoticePrinter) Print(line string) {
	if p == nil {
		return
	}
	w := p.w
	if w == nil {
		w = os.Stderr
	}
	switch {
	case strings.HasPrefix(line, "Device challenge OTP:"):
		if p.hasActiveChallenge {
			fmt.Fprintf(w, "\033[1A\r\033[2K  %s\r\n", line)
			return
		}
		fmt.Fprintf(w, "\r\n  %s\r\n", line)
		p.hasActiveChallenge = true
	case strings.HasPrefix(line, "Device challenge result:"):
		if p.hasActiveChallenge {
			fmt.Fprintf(w, "\033[1A\r\033[2K  %s\r\n", line)
			p.hasActiveChallenge = false
			return
		}
		fmt.Fprintf(w, "\r\n  %s\r\n", line)
	default:
		fmt.Fprintf(w, "\r\n  %s\r\n", line)
	}
}
