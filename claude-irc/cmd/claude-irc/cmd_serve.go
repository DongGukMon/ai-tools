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
				OnReady: func(info irc.ServerInfo) {
					connectURL, shortURL, webURL := serveURLs(info, publicURL)
					fmt.Fprintf(os.Stderr, "claude-irc serve started.\n")
					fmt.Fprintf(os.Stderr, "Connect URL: %s\n", connectURL)
					fmt.Fprintf(os.Stderr, "Short URL: %s\n", shortURL)
					if keyboardShortcutsAvailable() {
						fmt.Fprintf(os.Stderr, "\nShortcuts: [o] open in browser  [c] copy URL  [q] quit\n")
						go serveKeyboardLoop(ctx, webURL, connectURL, cancel)
					}
				},
			})
		},
	}

	cmd.Flags().IntVar(&port, "port", 8585, "HTTP server port")
	cmd.Flags().StringVar(&bindHost, "bind", "", "Host/address to bind the HTTP server to (default 127.0.0.1; set explicitly for non-local access)")
	cmd.Flags().StringVar(&tunnel, "tunnel", "", "Cloudflare Tunnel hostname (empty for quick tunnel, or domain like irc.bang9.dev)")
	cmd.Flags().StringVar(&masterTmux, "master-tmux", "", "Master tmux session name for capture/input endpoints")
	cmd.Flags().StringVar(&token, "token", "", "Pre-set auth token (reuse across restarts); if empty, a new one is generated")
	return cmd
}

func serveURLs(info irc.ServerInfo, publicURL string) (connectURL string, shortURL string, webURL string) {
	baseURL := info.LocalURL
	if publicURL != "" {
		baseURL = publicURL
	}
	connectURL = irc.ConnectURL(baseURL, info.Token)
	shortURL = fmt.Sprintf("%s/s/%s", strings.TrimRight(baseURL, "/"), info.ShortCode)
	webURL = irc.DashboardURL(connectURL)
	return connectURL, shortURL, webURL
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
		case 'q', 'Q', 3:
			fmt.Fprintf(deps.stderr, "\r\n")
			cancel()
			return
		}
	}
}
