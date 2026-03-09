package main

import (
	"bytes"
	"strings"
	"testing"
)

func TestHelloCmd(t *testing.T) {
	root := newRootCmd()
	var stdout bytes.Buffer
	root.SetOut(&stdout)
	root.SetErr(&stdout)
	root.SetArgs([]string{"hello"})

	if err := root.Execute(); err != nil {
		t.Fatalf("Execute: %v", err)
	}

	if got := stdout.String(); got != "hello world\n" {
		t.Fatalf("stdout = %q, want %q", got, "hello world\n")
	}
}

func TestConnectURLToken(t *testing.T) {
	tests := []struct {
		name string
		raw  string
		want string
	}{
		{name: "fragment token", raw: "https://public.example#token=abc123", want: "abc123"},
		{name: "legacy query token", raw: "https://public.example?token=abc123", want: "abc123"},
		{name: "missing token", raw: "https://public.example", want: ""},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			if got := connectURLToken(tc.raw); got != tc.want {
				t.Fatalf("connectURLToken(%q) = %q, want %q", tc.raw, got, tc.want)
			}
		})
	}
}

func TestServeOpenURL(t *testing.T) {
	tests := []struct {
		name     string
		shortURL string
		want     string
	}{
		{
			name:     "uses short url as-is",
			shortURL: "https://public.example/s/abc12345",
			want:     "https://public.example/s/abc12345",
		},
		{
			name: "empty short url",
			want: "",
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			if got := serveOpenURL(tc.shortURL); got != tc.want {
				t.Fatalf("serveOpenURL(%q) = %q, want %q", tc.shortURL, got, tc.want)
			}
		})
	}
}

func TestRemoteNoticePrinter_ReplacesChallengeWithResult(t *testing.T) {
	var stderr bytes.Buffer
	printer := remoteNoticePrinter{w: &stderr}

	printer.Print("Device challenge OTP: 123456  expires in 2m")
	printer.Print("Device challenge result: failed (invalid otp)")

	output := stderr.String()
	if !strings.Contains(output, "Device challenge OTP: 123456  expires in 2m") {
		t.Fatalf("expected challenge output, got %q", output)
	}
	if !strings.Contains(output, "\033[1A\r\033[2K  Device challenge result: failed (invalid otp)\r\n") {
		t.Fatalf("expected result replacement output, got %q", output)
	}
}
