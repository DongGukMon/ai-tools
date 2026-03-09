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

	"github.com/bang9/ai-tools/claude-irc/internal/irc"
	"github.com/spf13/cobra"
	"golang.org/x/term"
)

func serveCmd() *cobra.Command {
	var port int
	var bindHost string
	var tunnel string
	var masterTmux string
	var token string
	var authMode string
	var workspace string

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
			noticePrinter := serveNoticePrinter{w: os.Stderr}

			ctx, cancel := context.WithCancel(context.Background())
			defer cancel()

			sigCh := make(chan os.Signal, 1)
			signal.Notify(sigCh, syscall.SIGTERM, syscall.SIGINT)
			go func() { <-sigCh; cancel() }()

			var tunnelMgr *irc.TunnelManager
			var publicURL string
			if cmd.Flags().Changed("tunnel") {
				tunnelMgr = irc.NewTunnelManager(tunnel, port)
				publicURL, err = tunnelMgr.Start(ctx)
				if err != nil {
					return fmt.Errorf("tunnel: %w", err)
				}
				defer tunnelMgr.Stop()
			}

			return irc.RunServer(ctx, irc.ServerConfig{
				Port:       port,
				BindHost:   bindHost,
				Store:      store,
				MasterTmux: masterTmux,
				Token:      token,
				AuthMode:   authMode,
				Workspace:  workspace,
				OnDeviceChallenge: func(info irc.DeviceAuthChallengeInfo) {
					noticePrinter.PrintChallenge(formatDeviceChallengeLogLine(info))
				},
				OnDeviceChallengeResult: func(info irc.DeviceAuthChallengeResultInfo) {
					noticePrinter.PrintResult(formatDeviceChallengeResultLogLine(info))
				},
				OnReady: func(info irc.ServerInfo) {
					connectURL, shortURL, _ := serveURLs(info, publicURL)
					fmt.Fprintf(os.Stderr, "claude-irc serve started.\n")
					fmt.Fprintf(os.Stderr, "Connect URL: %s\n", connectURL)
					fmt.Fprintf(os.Stderr, "Short URL: %s\n", shortURL)
					if keyboardShortcutsAvailable() {
						fmt.Fprintf(os.Stderr, "\nShortcuts: [o] open short URL  [c] copy connect URL  [q] quit\n")
						go serveKeyboardLoop(ctx, shortURL, connectURL, cancel)
					}
				},
			})
		},
	}

	cmd.Flags().IntVar(&port, "port", 8585, "HTTP server port")
	cmd.Flags().StringVar(&bindHost, "bind", "", "Host/address to bind the HTTP server to (default 127.0.0.1; set explicitly for non-local access)")
	cmd.Flags().StringVar(&tunnel, "tunnel", "", "Cloudflare Tunnel hostname (empty for quick tunnel, or domain like irc.bang9.dev)")
	cmd.Flags().StringVar(&masterTmux, "master-tmux", "", "Master tmux session name for capture/input endpoints")
	cmd.Flags().StringVar(&authMode, "auth-mode", "device", "Remote auth mode (token or device)")
	cmd.Flags().StringVar(&workspace, "workspace", "global", "Workspace name for device auth/session storage")
	cmd.Flags().StringVar(&token, "token", "", "Pre-set auth token (reuse across restarts); if empty, a new one is generated")
	return cmd
}

const deviceChallengeLogPrefix = "Device challenge OTP:"
const deviceChallengeResultLogPrefix = "Device challenge result:"

func serveURLs(info irc.ServerInfo, publicURL string) (connectURL string, shortURL string, webURL string) {
	baseURL := info.LocalURL
	if publicURL != "" {
		baseURL = publicURL
	}
	if info.AuthMode == "device" {
		connectURL = irc.DeviceConnectURL(baseURL)
	} else {
		connectURL = irc.ConnectURL(baseURL, info.Token)
	}
	shortURL = fmt.Sprintf("%s/s/%s", strings.TrimRight(baseURL, "/"), info.ShortCode)
	webURL = irc.DashboardURL(connectURL)
	return connectURL, shortURL, webURL
}

func formatDeviceChallengeLogLine(info irc.DeviceAuthChallengeInfo) string {
	parts := []string{info.OTP}
	if ttl := formatChallengeTTL(info.CreatedAt, info.ExpiresAt); ttl != "" {
		parts = append(parts, ttl)
	}
	return fmt.Sprintf("%s %s", deviceChallengeLogPrefix, strings.Join(parts, "  "))
}

func formatDeviceChallengeResultLogLine(info irc.DeviceAuthChallengeResultInfo) string {
	status := info.Result
	if status == "error" && info.Error != "" {
		status = fmt.Sprintf("failed (%s)", info.Error)
	} else if status == "error" {
		status = "failed"
	}
	return fmt.Sprintf("%s %s", deviceChallengeResultLogPrefix, status)
}

func writeServeNotice(w io.Writer, line string) {
	fmt.Fprintf(w, "\r\n%s\r\n", line)
}

type serveNoticePrinter struct {
	w                  io.Writer
	hasActiveChallenge bool
}

func (p *serveNoticePrinter) PrintChallenge(line string) {
	if p == nil {
		return
	}
	if p.hasActiveChallenge {
		fmt.Fprintf(p.w, "\033[1A\r\033[2K%s\r\n", line)
		return
	}
	writeServeNotice(p.w, line)
	p.hasActiveChallenge = true
}

func (p *serveNoticePrinter) PrintResult(line string) {
	if p == nil {
		return
	}
	if p.hasActiveChallenge {
		fmt.Fprintf(p.w, "\033[1A\r\033[2K%s\r\n", line)
		p.hasActiveChallenge = false
		return
	}
	writeServeNotice(p.w, line)
}

func formatChallengeTTL(createdAt, expiresAt time.Time) string {
	if createdAt.IsZero() || expiresAt.IsZero() {
		return ""
	}
	remaining := expiresAt.Sub(createdAt)
	if remaining <= 0 {
		return ""
	}
	totalSeconds := int(remaining / time.Second)
	if totalSeconds%60 == 0 {
		return fmt.Sprintf("expires in %dm", totalSeconds/60)
	}
	return fmt.Sprintf("expires in %ds", totalSeconds)
}

type keyboardLoopDeps struct {
	stdin    io.Reader
	stderr   io.Writer
	makeRaw  func() (func(), error)
	openURL  func(string) error
	copyText func(string) error
}

func keyboardShortcutsAvailable() bool {
	return term.IsTerminal(int(os.Stdin.Fd()))
}

func serveKeyboardLoop(ctx context.Context, shortURL, connectURL string, cancel context.CancelFunc) {
	fd := int(os.Stdin.Fd())
	if !term.IsTerminal(fd) {
		return
	}
	serveKeyboardLoopWithDeps(ctx, shortURL, connectURL, cancel, keyboardLoopDeps{
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

func serveKeyboardLoopWithDeps(ctx context.Context, shortURL, connectURL string, cancel context.CancelFunc, deps keyboardLoopDeps) {
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
			if err := deps.openURL(shortURL); err != nil {
				fmt.Fprintf(deps.stderr, "\rFailed to open browser: %v\n", err)
				continue
			}
			fmt.Fprintf(deps.stderr, "\rOpened short URL\n")
		case 'c', 'C':
			if err := deps.copyText(connectURL); err != nil {
				fmt.Fprintf(deps.stderr, "\rFailed to copy URL: %v\n", err)
				continue
			}
			fmt.Fprintf(deps.stderr, "\rCopied to clipboard\n")
		case 'q', 'Q', 3:
			fmt.Fprintf(deps.stderr, "\r\n")
			cancel()
			return
		}
	}
}
