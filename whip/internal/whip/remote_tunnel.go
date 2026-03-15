package whip

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strings"
	"syscall"
	"time"
)

// TunnelManager manages a cloudflared tunnel subprocess.
type TunnelManager struct {
	hostname   string // custom domain or empty for quick tunnel
	tunnelName string // for named: "claude-irc-<sanitized-hostname>"
	localPort  int
	cmd        *exec.Cmd
	configPath string // temp YAML config path (named tunnel only)
}

// NewTunnelManager creates a new TunnelManager.
// If hostname is empty, a quick tunnel (random trycloudflare.com URL) is used.
// If hostname is provided, a named tunnel with DNS routing is set up.
func NewTunnelManager(hostname string, localPort int) *TunnelManager {
	tm := &TunnelManager{
		hostname:  hostname,
		localPort: localPort,
	}
	if hostname != "" {
		tm.tunnelName = tunnelNameFromHostname(hostname)
	}
	return tm
}

// Start starts the cloudflared tunnel and returns the public URL.
func (t *TunnelManager) Start(ctx context.Context) (string, error) {
	if _, err := exec.LookPath("cloudflared"); err != nil {
		return "", fmt.Errorf("cloudflared not found. Install it first: brew install cloudflared (macOS) or see https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/")
	}

	if t.hostname != "" {
		return t.startNamed(ctx)
	}
	return t.startQuick(ctx)
}

// Stop gracefully stops the cloudflared subprocess.
func (t *TunnelManager) Stop() error {
	if t.cmd == nil || t.cmd.Process == nil {
		return nil
	}

	// Send SIGTERM
	if err := t.cmd.Process.Signal(syscall.SIGTERM); err != nil {
		// Process may already be dead
		t.cleanup()
		return nil
	}

	// Wait up to 3 seconds for graceful exit
	done := make(chan error, 1)
	go func() {
		done <- t.cmd.Wait()
	}()

	select {
	case <-done:
	case <-time.After(3 * time.Second):
		t.cmd.Process.Signal(syscall.SIGKILL)
		<-done
	}

	t.cleanup()
	return nil
}

func (t *TunnelManager) cleanup() {
	if t.configPath != "" {
		os.Remove(t.configPath)
		t.configPath = ""
	}
}

func (t *TunnelManager) startQuick(ctx context.Context) (string, error) {
	t.cmd = exec.CommandContext(ctx, "cloudflared", "tunnel", "--url", fmt.Sprintf("http://localhost:%d", t.localPort))

	stderr, err := t.cmd.StderrPipe()
	if err != nil {
		return "", fmt.Errorf("creating stderr pipe: %w", err)
	}

	if err := t.cmd.Start(); err != nil {
		return "", fmt.Errorf("starting cloudflared: %w", err)
	}

	// Parse the trycloudflare.com URL from stderr output
	urlCh := make(chan string, 1)
	errCh := make(chan error, 1)

	go func() {
		scanner := bufio.NewScanner(stderr)
		urlPattern := regexp.MustCompile(`https://[a-zA-Z0-9-]+\.trycloudflare\.com`)
		for scanner.Scan() {
			line := scanner.Text()
			if match := urlPattern.FindString(line); match != "" {
				urlCh <- match
				return
			}
		}
		if err := scanner.Err(); err != nil {
			errCh <- fmt.Errorf("reading cloudflared output: %w", err)
		} else {
			errCh <- fmt.Errorf("cloudflared exited without providing a URL")
		}
	}()

	select {
	case url := <-urlCh:
		return url, nil
	case err := <-errCh:
		t.Stop()
		return "", err
	case <-time.After(30 * time.Second):
		t.Stop()
		return "", fmt.Errorf("timed out waiting for cloudflared tunnel URL")
	case <-ctx.Done():
		t.Stop()
		return "", ctx.Err()
	}
}

func (t *TunnelManager) startNamed(ctx context.Context) (string, error) {
	// Check cert.pem exists
	home, err := os.UserHomeDir()
	if err != nil {
		return "", fmt.Errorf("cannot determine home directory: %w", err)
	}
	certPath := filepath.Join(home, ".cloudflared", "cert.pem")
	if _, err := os.Stat(certPath); os.IsNotExist(err) {
		return "", fmt.Errorf("cloudflared not authenticated. Run 'cloudflared tunnel login' first to authorize.")
	}

	// Check if tunnel already exists
	exists, err := t.tunnelExists()
	if err != nil {
		return "", fmt.Errorf("checking tunnel: %w", err)
	}

	// Create tunnel if it doesn't exist
	if !exists {
		if err := t.createTunnel(); err != nil {
			return "", fmt.Errorf("creating tunnel: %w", err)
		}
	}

	// Route DNS
	if err := t.routeDNS(); err != nil {
		return "", fmt.Errorf("routing DNS: %w", err)
	}

	// Write temp config
	if err := t.writeConfig(); err != nil {
		return "", fmt.Errorf("writing config: %w", err)
	}

	// Start the tunnel
	t.cmd = exec.CommandContext(ctx, "cloudflared", "tunnel", "--config", t.configPath, "run", t.tunnelName)
	if err := t.cmd.Start(); err != nil {
		t.cleanup()
		return "", fmt.Errorf("starting cloudflared tunnel: %w", err)
	}

	return fmt.Sprintf("https://%s", t.hostname), nil
}

type cloudflaredTunnel struct {
	Name string `json:"name"`
}

func (t *TunnelManager) tunnelExists() (bool, error) {
	out, err := exec.Command("cloudflared", "tunnel", "list", "-o", "json").Output()
	if err != nil {
		return false, fmt.Errorf("listing tunnels: %w", err)
	}

	var tunnels []cloudflaredTunnel
	if err := json.Unmarshal(out, &tunnels); err != nil {
		return false, fmt.Errorf("parsing tunnel list: %w", err)
	}

	for _, tun := range tunnels {
		if tun.Name == t.tunnelName {
			return true, nil
		}
	}
	return false, nil
}

func (t *TunnelManager) createTunnel() error {
	cmd := exec.Command("cloudflared", "tunnel", "create", t.tunnelName)
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	return cmd.Run()
}

func (t *TunnelManager) routeDNS() error {
	cmd := exec.Command("cloudflared", "tunnel", "route", "dns", "--overwrite-dns", t.tunnelName, t.hostname)
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	return cmd.Run()
}

func (t *TunnelManager) writeConfig() error {
	config := fmt.Sprintf(`tunnel: %s
ingress:
  - hostname: %s
    service: http://localhost:%d
  - service: http_status:404
`, t.tunnelName, t.hostname, t.localPort)

	tmpFile, err := os.CreateTemp("", "cloudflared-*.yml")
	if err != nil {
		return fmt.Errorf("creating temp config: %w", err)
	}

	if _, err := tmpFile.WriteString(config); err != nil {
		tmpFile.Close()
		os.Remove(tmpFile.Name())
		return fmt.Errorf("writing config: %w", err)
	}
	tmpFile.Close()

	t.configPath = tmpFile.Name()
	return nil
}

func tunnelNameFromHostname(hostname string) string {
	sanitized := strings.ReplaceAll(hostname, ".", "-")
	return "claude-irc-" + sanitized
}
