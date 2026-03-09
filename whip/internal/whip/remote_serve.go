package whip

import (
	"bufio"
	"context"
	"fmt"
	"os"
	"os/exec"
	"strconv"
	"strings"
	"time"
)

// StartServe starts `claude-irc serve` as a subprocess and returns the
// process handle, the parsed URLs, and any error.
// When silent is true, stdout/stderr are suppressed and stdin is detached (for TUI embedding).
func StartServe(ctx context.Context, cfg RemoteConfig, token string, silent bool) (*exec.Cmd, ServeResult, error) {
	args := []string{"serve", "--port", strconv.Itoa(cfg.Port), "--master-tmux", WorkspaceMasterSessionName(cfg.Workspace)}
	if cfg.Tunnel != "" {
		args = append(args, "--tunnel", cfg.Tunnel)
	}
	if token != "" {
		args = append(args, "--token", token)
	}

	cmd := exec.CommandContext(ctx, "claude-irc", args...)
	if silent {
		cmd.Stdin = nil
	} else {
		cmd.Stdout = os.Stdout
	}

	stderrPipe, err := cmd.StderrPipe()
	if err != nil {
		return nil, ServeResult{}, fmt.Errorf("stderr pipe: %w", err)
	}

	if err := cmd.Start(); err != nil {
		return nil, ServeResult{}, fmt.Errorf("start claude-irc serve: %w", err)
	}

	var result ServeResult
	done := make(chan struct{})
	go func() {
		scanner := bufio.NewScanner(stderrPipe)
		for scanner.Scan() {
			line := scanner.Text()
			if !silent {
				fmt.Fprintln(os.Stderr, line)
			}
			if strings.Contains(line, "Connect URL:") {
				result.ConnectURL = strings.TrimSpace(strings.TrimPrefix(line, "Connect URL:"))
			}
			if strings.Contains(line, "Short URL:") {
				result.ShortURL = strings.TrimSpace(strings.TrimPrefix(line, "Short URL:"))
			}
			if result.ConnectURL != "" && (cfg.Tunnel == "" || result.ShortURL != "") {
				break
			}
		}
		close(done)
	}()

	select {
	case <-done:
	case <-time.After(10 * time.Second):
		return cmd, result, fmt.Errorf("timeout waiting for serve URLs")
	}

	return cmd, result, nil
}
