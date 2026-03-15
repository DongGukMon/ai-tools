package main

import (
	"context"
	"fmt"
	"io"
	"os"
	"os/exec"
	"os/signal"
	"strings"
	"sync"
	"syscall"
	"time"

	"github.com/bang9/ai-tools/whip/internal/whip"
	qrterminal "github.com/mdp/qrterminal/v3"
	"github.com/spf13/cobra"
	"golang.org/x/term"
)

var (
	remoteLookPath                   = exec.LookPath
	remoteNewStore                   = whip.NewStore
	remoteGetwd                      = os.Getwd
	remoteIsMasterSessionAlive       = whip.IsMasterSessionAlive
	remoteSpawnMasterSession         = whip.SpawnMasterSession
	remoteStartServe                 = whip.StartServe
	remoteSignalNotify               = signal.Notify
	remoteSignalStop                 = signal.Stop
	remotePrintQR                    = func(target string, w io.Writer) { qrterminal.Generate(target, qrterminal.L, w) }
	remoteKeyboardShortcutsAvailable = func() bool {
		return term.IsTerminal(int(os.Stdin.Fd()))
	}
	remoteKeyboardInput   = func() io.Reader { return os.Stdin }
	remoteKeyboardOutput  = func() io.Writer { return os.Stderr }
	remoteKeyboardMakeRaw = func() (func(), error) {
		fd := int(os.Stdin.Fd())
		state, err := term.MakeRaw(fd)
		if err != nil {
			return nil, err
		}
		return func() {
			_ = term.Restore(fd, state)
		}, nil
	}
	remoteOpenShortURL = func(url string) error {
		return exec.Command("open", url).Start()
	}
	remoteCopyConnectURL = func(text string) error {
		cmd := exec.Command("pbcopy")
		cmd.Stdin = strings.NewReader(text)
		return cmd.Run()
	}
)

type remoteKeyboardDeps struct {
	stdin    io.Reader
	stderr   io.Writer
	makeRaw  func() (func(), error)
	openURL  func(string) error
	copyText func(string) error
}

func remoteCmd() *cobra.Command {
	var backend, bindHost, difficulty, tunnel, workspace, authMode string
	var port int

	cmd := &cobra.Command{
		Use:   "remote",
		Short: "Start master session with remote dashboard access",
		Args:  cobra.NoArgs,
		RunE: func(cmd *cobra.Command, args []string) error {
			if _, err := remoteLookPath("tmux"); err != nil {
				return fmt.Errorf("tmux is required but not installed\n\nInstall with:\n  brew install tmux    (macOS)\n  apt install tmux     (Ubuntu/Debian)\n  pacman -S tmux       (Arch)")
			}

			store, err := remoteNewStore()
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

			cwd, err := remoteGetwd()
			if err != nil {
				return fmt.Errorf("cannot determine working directory: %w", err)
			}

			remoteCfg := whip.RemoteConfig{
				Backend:    backend,
				Difficulty: difficulty,
				Tunnel:     tunnel,
				Port:       port,
				BindHost:   bindHost,
				CWD:        cwd,
				Workspace:  whip.NormalizeWorkspaceName(workspace),
				AuthMode:   authMode,
			}
			masterSession := whip.WorkspaceMasterSessionName(remoteCfg.Workspace)

			if remoteIsMasterSessionAlive(remoteCfg.Workspace) {
				fmt.Fprintf(os.Stderr, "Master session already running (%s)\n", masterSession)
				fmt.Fprintf(os.Stderr, "Attach with: tmux attach -t %s\n", masterSession)
			} else {
				fmt.Fprintln(os.Stderr, "Spawning master session...")
				if err := remoteSpawnMasterSession(remoteCfg); err != nil {
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

			fmt.Fprintln(os.Stderr, "Starting remote access...")
			noticePrinter := remoteNoticePrinter{w: os.Stderr}
			handle, serveResult, err := remoteStartServe(ctx, remoteCfg, serveToken, true, func(line string) {
				noticePrinter.Print(line)
			})
			if err != nil {
				return fmt.Errorf("failed to start remote access: %w", err)
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
				qrTarget = openURL
			}
			if qrTarget != "" {
				remotePrintQR(qrTarget, os.Stderr)
				fmt.Fprintln(os.Stderr, "")
			}

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
			remoteSignalNotify(sigCh, syscall.SIGINT, syscall.SIGTERM)
			defer remoteSignalStop(sigCh)

			var quitCh <-chan struct{}
			if remoteKeyboardShortcutsAvailable() {
				keyboardQuitCh := make(chan struct{})
				quitCh = keyboardQuitCh
				fmt.Fprintln(os.Stderr, "  Shortcuts: [o] open short URL  [c] copy connect URL  [q] quit")
				go remoteKeyboardLoop(ctx, openURL, connectURL, keyboardQuitCh)
			}

			select {
			case <-sigCh:
			case <-quitCh:
			}

			fmt.Fprintln(os.Stderr, "\nStopping remote access...")
			cancel()
			if handle != nil {
				_ = handle.Stop(5 * time.Second)
			}

			fmt.Fprintf(os.Stderr, "Remote access stopped. Master session persists — reattach with: tmux attach -t %s\n", masterSession)
			return nil
		},
	}

	cmd.Flags().StringVar(&backend, "backend", "claude", "AI backend (claude or codex)")
	cmd.Flags().StringVar(&difficulty, "difficulty", "hard", "Task difficulty (hard, medium, easy)")
	cmd.Flags().StringVar(&tunnel, "tunnel", "", "Cloudflare tunnel hostname")
	cmd.Flags().IntVar(&port, "port", 8585, "Serve port")
	cmd.Flags().StringVar(&bindHost, "bind-host", "", "Host/address to bind the remote HTTP server to (default 127.0.0.1; set explicitly for LAN/non-local access)")
	cmd.Flags().StringVar(&workspace, "workspace", "", "Workspace name (default: global)")
	cmd.Flags().StringVar(&authMode, "auth-mode", whip.RemoteAuthModeDevice, "Remote auth mode (token or device)")
	cmd.Flags().Bool("new-token", false, "Generate a new auth token (discard saved token)")

	return cmd
}

func remoteKeyboardLoop(ctx context.Context, openURL string, connectURL string, quit chan struct{}) {
	remoteKeyboardLoopWithDeps(ctx, openURL, connectURL, quit, remoteKeyboardDeps{
		stdin:    remoteKeyboardInput(),
		stderr:   remoteKeyboardOutput(),
		makeRaw:  remoteKeyboardMakeRaw,
		openURL:  remoteOpenShortURL,
		copyText: remoteCopyConnectURL,
	})
}

func remoteKeyboardLoopWithDeps(ctx context.Context, openURL string, connectURL string, quit chan struct{}, deps remoteKeyboardDeps) {
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
	if done := ctx.Done(); done != nil {
		go func() {
			<-done
			restoreTerminal()
		}()
	}

	buf := make([]byte, 1)
	for {
		n, err := deps.stdin.Read(buf)
		if err != nil || n == 0 {
			return
		}
		switch buf[0] {
		case 'q', 'Q', 3:
			if quit != nil {
				close(quit)
			}
			fmt.Fprint(deps.stderr, "\r\n")
			return
		case 'o', 'O':
			if openURL != "" {
				if err := deps.openURL(openURL); err != nil {
					fmt.Fprintf(deps.stderr, "\rFailed to open short URL: %v\r\n", err)
					continue
				}
				fmt.Fprint(deps.stderr, "\rOpened short URL\r\n")
			}
		case 'c', 'C':
			if connectURL != "" {
				if err := deps.copyText(connectURL); err != nil {
					fmt.Fprintf(deps.stderr, "\rFailed to copy connect URL: %v\r\n", err)
					continue
				}
				fmt.Fprint(deps.stderr, "\rCopied connect URL\r\n")
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
