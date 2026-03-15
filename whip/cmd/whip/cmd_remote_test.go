package main

import (
	"bytes"
	"context"
	"errors"
	"io"
	"os"
	"path/filepath"
	"strings"
	"syscall"
	"testing"

	whiplib "github.com/bang9/ai-tools/whip/internal/whip"
)

func TestRemoteCommandHelpIncludesBindHostFlag(t *testing.T) {
	stdout, _, err := execWhipCLICapture(t, "remote", "--help")
	if err != nil {
		t.Fatalf("remote --help: %v", err)
	}
	if !strings.Contains(stdout, "--bind-host") {
		t.Fatalf("remote --help missing bind-host flag:\n%s", stdout)
	}
	if !strings.Contains(stdout, "LAN/non-local access") {
		t.Fatalf("remote --help missing bind-host description:\n%s", stdout)
	}
}

func TestRemoteCommandPassesBindHostAndRunsShortcuts(t *testing.T) {
	prepareRemoteCommandTest(t)

	var capturedCfg whiplib.RemoteConfig
	var opened string
	var copied string

	remoteStartServe = func(ctx context.Context, cfg whiplib.RemoteConfig, token string, silent bool, onServeNotice func(string)) (*whiplib.RemoteHandle, whiplib.ServeResult, error) {
		capturedCfg = cfg
		return nil, whiplib.ServeResult{
			ConnectURL: "https://connect.example#token=test-token",
			ShortURL:   "https://short.example/s/abc12345",
		}, nil
	}
	remoteKeyboardShortcutsAvailable = func() bool { return true }
	remoteKeyboardInput = func() io.Reader { return bytes.NewBufferString("ocq") }
	remoteKeyboardMakeRaw = func() (func(), error) {
		return func() {}, nil
	}
	remoteOpenShortURL = func(url string) error {
		opened = url
		return nil
	}
	remoteCopyConnectURL = func(text string) error {
		copied = text
		return nil
	}

	_, stderr, err := execWhipCLICapture(t, "remote", "--bind-host", "0.0.0.0", "--workspace", "demo", "--auth-mode", "token")
	if err != nil {
		t.Fatalf("whip remote: %v", err)
	}

	if capturedCfg.BindHost != "0.0.0.0" {
		t.Fatalf("expected bind host 0.0.0.0, got %q", capturedCfg.BindHost)
	}
	if capturedCfg.Workspace != "demo" {
		t.Fatalf("expected workspace demo, got %q", capturedCfg.Workspace)
	}
	if capturedCfg.AuthMode != whiplib.RemoteAuthModeToken {
		t.Fatalf("expected auth mode %q, got %q", whiplib.RemoteAuthModeToken, capturedCfg.AuthMode)
	}
	if opened != "https://short.example/s/abc12345" {
		t.Fatalf("expected short URL open shortcut, got %q", opened)
	}
	if copied != "https://connect.example#token=test-token" {
		t.Fatalf("expected connect URL copy shortcut, got %q", copied)
	}
	if !strings.Contains(stderr, "Shortcuts: [o] open short URL  [c] copy connect URL  [q] quit") {
		t.Fatalf("expected shortcut banner in stderr:\n%s", stderr)
	}
	if !strings.Contains(stderr, "Opened short URL") {
		t.Fatalf("expected open shortcut confirmation in stderr:\n%s", stderr)
	}
	if !strings.Contains(stderr, "Copied connect URL") {
		t.Fatalf("expected copy shortcut confirmation in stderr:\n%s", stderr)
	}

	store, err := whiplib.NewStore()
	if err != nil {
		t.Fatalf("NewStore: %v", err)
	}
	cfg, err := store.LoadConfig()
	if err != nil {
		t.Fatalf("LoadConfig: %v", err)
	}
	if cfg.ServeToken != "test-token" {
		t.Fatalf("expected saved serve token test-token, got %q", cfg.ServeToken)
	}
}

func TestRemoteCommandOmitsShortcutsWithoutTTY(t *testing.T) {
	prepareRemoteCommandTest(t)

	remoteStartServe = func(ctx context.Context, cfg whiplib.RemoteConfig, token string, silent bool, onServeNotice func(string)) (*whiplib.RemoteHandle, whiplib.ServeResult, error) {
		return nil, whiplib.ServeResult{
			ConnectURL: "https://connect.example#token=test-token",
			ShortURL:   "https://short.example/s/abc12345",
		}, nil
	}
	remoteKeyboardShortcutsAvailable = func() bool { return false }
	remoteSignalNotify = func(c chan<- os.Signal, sig ...os.Signal) {
		go func() {
			c <- syscall.SIGINT
		}()
	}
	remoteSignalStop = func(chan<- os.Signal) {}

	_, stderr, err := execWhipCLICapture(t, "remote")
	if err != nil {
		t.Fatalf("whip remote: %v", err)
	}
	if strings.Contains(stderr, "Shortcuts: [o] open short URL  [c] copy connect URL  [q] quit") {
		t.Fatalf("did not expect shortcut banner without TTY:\n%s", stderr)
	}
}

func TestRemoteKeyboardLoopWithDeps_Shortcuts(t *testing.T) {
	ctx := context.Background()
	quit := make(chan struct{})

	var stderr bytes.Buffer
	var opened string
	var copied string
	restoreCalls := 0

	remoteKeyboardLoopWithDeps(ctx, "https://short.example", "https://connect.example", quit, remoteKeyboardDeps{
		stdin:  bytes.NewBufferString("ocq"),
		stderr: &stderr,
		makeRaw: func() (func(), error) {
			return func() {
				restoreCalls++
			}, nil
		},
		openURL: func(url string) error {
			opened = url
			return nil
		},
		copyText: func(text string) error {
			copied = text
			return nil
		},
	})

	select {
	case <-quit:
	default:
		t.Fatal("expected keyboard shortcut loop to close quit channel")
	}
	if opened != "https://short.example" {
		t.Fatalf("expected short URL to be opened, got %q", opened)
	}
	if copied != "https://connect.example" {
		t.Fatalf("expected connect URL to be copied, got %q", copied)
	}
	if restoreCalls != 1 {
		t.Fatalf("expected terminal restore to run once, got %d", restoreCalls)
	}

	output := stderr.String()
	if !strings.Contains(output, "Opened short URL") {
		t.Fatalf("expected short URL confirmation in stderr, got %q", output)
	}
	if !strings.Contains(output, "Copied connect URL") {
		t.Fatalf("expected connect URL confirmation in stderr, got %q", output)
	}
}

func TestRemoteKeyboardLoopWithDeps_MakeRawError(t *testing.T) {
	var stderr bytes.Buffer

	remoteKeyboardLoopWithDeps(context.Background(), "https://short.example", "https://connect.example", make(chan struct{}), remoteKeyboardDeps{
		stdin:  bytes.NewBufferString("o"),
		stderr: &stderr,
		makeRaw: func() (func(), error) {
			return nil, errors.New("tty unavailable")
		},
		openURL: func(string) error {
			t.Fatal("openURL should not be called when raw mode setup fails")
			return nil
		},
		copyText: func(string) error {
			t.Fatal("copyText should not be called when raw mode setup fails")
			return nil
		},
	})

	if !strings.Contains(stderr.String(), "Shortcuts unavailable: tty unavailable") {
		t.Fatalf("expected raw mode failure to be reported, got %q", stderr.String())
	}
}

func prepareRemoteCommandTest(t *testing.T) {
	t.Helper()

	home := t.TempDir()
	t.Setenv("HOME", home)
	t.Setenv("WHIP_HOME", filepath.Join(home, ".whip"))

	cwd := t.TempDir()
	oldWD, err := os.Getwd()
	if err != nil {
		t.Fatalf("Getwd: %v", err)
	}
	if err := os.Chdir(cwd); err != nil {
		t.Fatalf("Chdir(%q): %v", cwd, err)
	}
	t.Cleanup(func() {
		_ = os.Chdir(oldWD)
	})

	oldLookPath := remoteLookPath
	oldIsMasterSessionAlive := remoteIsMasterSessionAlive
	oldSpawnMasterSession := remoteSpawnMasterSession
	oldStartServe := remoteStartServe
	oldSignalNotify := remoteSignalNotify
	oldSignalStop := remoteSignalStop
	oldPrintQR := remotePrintQR
	oldKeyboardShortcutsAvailable := remoteKeyboardShortcutsAvailable
	oldKeyboardInput := remoteKeyboardInput
	oldKeyboardOutput := remoteKeyboardOutput
	oldKeyboardMakeRaw := remoteKeyboardMakeRaw
	oldOpenShortURL := remoteOpenShortURL
	oldCopyConnectURL := remoteCopyConnectURL
	t.Cleanup(func() {
		remoteLookPath = oldLookPath
		remoteIsMasterSessionAlive = oldIsMasterSessionAlive
		remoteSpawnMasterSession = oldSpawnMasterSession
		remoteStartServe = oldStartServe
		remoteSignalNotify = oldSignalNotify
		remoteSignalStop = oldSignalStop
		remotePrintQR = oldPrintQR
		remoteKeyboardShortcutsAvailable = oldKeyboardShortcutsAvailable
		remoteKeyboardInput = oldKeyboardInput
		remoteKeyboardOutput = oldKeyboardOutput
		remoteKeyboardMakeRaw = oldKeyboardMakeRaw
		remoteOpenShortURL = oldOpenShortURL
		remoteCopyConnectURL = oldCopyConnectURL
	})

	remoteLookPath = func(file string) (string, error) {
		if file == "tmux" {
			return "/usr/bin/tmux", nil
		}
		return "", errors.New("unexpected executable lookup")
	}
	remoteIsMasterSessionAlive = func(string) bool { return false }
	remoteSpawnMasterSession = func(whiplib.RemoteConfig) error { return nil }
	remotePrintQR = func(string, io.Writer) {}
	remoteKeyboardShortcutsAvailable = func() bool { return false }
	remoteKeyboardInput = func() io.Reader { return bytes.NewBuffer(nil) }
	remoteKeyboardOutput = func() io.Writer { return os.Stderr }
	remoteKeyboardMakeRaw = func() (func(), error) { return func() {}, nil }
	remoteOpenShortURL = func(string) error { return nil }
	remoteCopyConnectURL = func(string) error { return nil }
}
