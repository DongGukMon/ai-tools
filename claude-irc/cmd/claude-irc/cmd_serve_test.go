package main

import (
	"bytes"
	"context"
	"errors"
	"strings"
	"testing"

	"github.com/bang9/ai-tools/claude-irc/internal/irc"
)

func TestServeKeyboardLoopWithDeps_Shortcuts(t *testing.T) {
	ctx, stop := context.WithCancel(context.Background())
	defer stop()

	var stderr bytes.Buffer
	var opened string
	var copied string
	restoreCalls := 0
	cancelled := false

	serveKeyboardLoopWithDeps(ctx, "https://web.example", "https://connect.example", func() {
		cancelled = true
		stop()
	}, keyboardLoopDeps{
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

	if opened != "https://web.example" {
		t.Fatalf("expected browser URL to be opened, got %q", opened)
	}
	if copied != "https://connect.example" {
		t.Fatalf("expected connect URL to be copied, got %q", copied)
	}
	if !cancelled {
		t.Fatal("expected keyboard shortcut loop to call cancel on q")
	}
	if restoreCalls != 1 {
		t.Fatalf("expected terminal restore to run once, got %d", restoreCalls)
	}

	output := stderr.String()
	if !strings.Contains(output, "Opened in browser") {
		t.Fatalf("expected browser confirmation in stderr, got %q", output)
	}
	if !strings.Contains(output, "Copied to clipboard") {
		t.Fatalf("expected clipboard confirmation in stderr, got %q", output)
	}
}

func TestServeKeyboardLoopWithDeps_MakeRawError(t *testing.T) {
	var stderr bytes.Buffer

	serveKeyboardLoopWithDeps(context.Background(), "https://web.example", "https://connect.example", func() {}, keyboardLoopDeps{
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

func TestServeURLs_LocalConnectURLUsesFragmentToken(t *testing.T) {
	info := irc.ServerInfo{
		Token:     "test-token",
		ShortCode: "abc12345",
		LocalURL:  "http://localhost:8585",
	}

	connectURL, shortURL, webURL := serveURLs(info, "")

	if connectURL != "http://localhost:8585#token=test-token" {
		t.Fatalf("unexpected connect URL: %q", connectURL)
	}
	if shortURL != "http://localhost:8585/s/abc12345" {
		t.Fatalf("unexpected short URL: %q", shortURL)
	}
	if webURL != "https://whip.bang9.dev#http://localhost:8585#token=test-token" {
		t.Fatalf("unexpected web URL: %q", webURL)
	}
}

func TestServeURLs_PublicURLOverridesLocalURL(t *testing.T) {
	info := irc.ServerInfo{
		Token:     "test-token",
		ShortCode: "abc12345",
		LocalURL:  "http://localhost:8585",
	}

	connectURL, shortURL, webURL := serveURLs(info, "https://public.example")

	if connectURL != "https://public.example#token=test-token" {
		t.Fatalf("unexpected connect URL: %q", connectURL)
	}
	if shortURL != "https://public.example/s/abc12345" {
		t.Fatalf("unexpected short URL: %q", shortURL)
	}
	if webURL != "https://whip.bang9.dev#https://public.example#token=test-token" {
		t.Fatalf("unexpected web URL: %q", webURL)
	}
}
