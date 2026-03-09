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

const deviceChallengeLogPrefix = "Device challenge OTP:"

// StartServe starts `claude-irc serve` as a subprocess and returns the
// process handle, the parsed URLs, and any error.
// When silent is true, stdout/stderr are suppressed and stdin is detached (for TUI embedding).
func StartServe(ctx context.Context, cfg RemoteConfig, token string, silent bool, onDeviceChallenge func(string)) (*exec.Cmd, ServeResult, error) {
	authMode := NormalizeRemoteAuthMode(cfg.AuthMode)
	args := []string{
		"serve",
		"--port", strconv.Itoa(cfg.Port),
		"--master-tmux", WorkspaceMasterSessionName(cfg.Workspace),
		"--workspace", cfg.Workspace,
		"--auth-mode", authMode,
	}
	if cfg.Tunnel != "" {
		args = append(args, "--tunnel", cfg.Tunnel)
	}
	if authMode == RemoteAuthModeToken && token != "" {
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
	readyCh := make(chan ServeResult, 1)
	go func() {
		scanner := bufio.NewScanner(stderrPipe)
		readySent := false
		for scanner.Scan() {
			line := scanner.Text()
			if handleServeStderrLine(cfg, &result, line, silent, onDeviceChallenge) && !readySent {
				readyCh <- result
				readySent = true
			}
		}
	}()

	select {
	case result = <-readyCh:
	case <-time.After(10 * time.Second):
		return cmd, result, fmt.Errorf("timeout waiting for serve URLs")
	}

	return cmd, result, nil
}

func handleServeStderrLine(cfg RemoteConfig, result *ServeResult, line string, silent bool, onDeviceChallenge func(string)) bool {
	if !silent {
		fmt.Fprintln(os.Stderr, line)
	}
	if strings.Contains(line, "Connect URL:") {
		result.ConnectURL = strings.TrimSpace(strings.TrimPrefix(line, "Connect URL:"))
	}
	if strings.Contains(line, "Short URL:") {
		result.ShortURL = strings.TrimSpace(strings.TrimPrefix(line, "Short URL:"))
	}
	if strings.HasPrefix(line, deviceChallengeLogPrefix) && onDeviceChallenge != nil {
		onDeviceChallenge(line)
	}
	return result.ConnectURL != "" && (cfg.Tunnel == "" || result.ShortURL != "")
}
