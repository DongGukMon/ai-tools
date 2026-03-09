package whip

import "testing"

func TestSanitizeServeStderrLineStripsANSI(t *testing.T) {
	got := sanitizeServeStderrLine("\x1b[1A\r\x1b[2KDevice challenge result: failed (invalid otp)")
	want := "Device challenge result: failed (invalid otp)"
	if got != want {
		t.Fatalf("sanitizeServeStderrLine() = %q, want %q", got, want)
	}
}

func TestHandleServeStderrLineCapturesURLs(t *testing.T) {
	cfg := RemoteConfig{}
	var result ServeResult

	if ready := handleServeStderrLine(cfg, &result, "Connect URL: https://public.example#token=abc123", true, nil); ready {
		t.Fatal("did not expect ready before short url")
	}
	if ready := handleServeStderrLine(cfg, &result, "Short URL: https://public.example/s/abc12345", true, nil); !ready {
		t.Fatal("expected ready after short url")
	}
	if result.ConnectURL != "https://public.example#token=abc123" {
		t.Fatalf("connect url = %q", result.ConnectURL)
	}
	if result.ShortURL != "https://public.example/s/abc12345" {
		t.Fatalf("short url = %q", result.ShortURL)
	}
}

func TestHandleServeStderrLineRequiresShortURLWhenTunnelEnabled(t *testing.T) {
	cfg := RemoteConfig{Tunnel: "public.example"}
	var result ServeResult

	if ready := handleServeStderrLine(cfg, &result, "Connect URL: https://public.example#mode=device", true, nil); ready {
		t.Fatal("did not expect ready before short url")
	}
	if ready := handleServeStderrLine(cfg, &result, "Short URL: https://public.example/s/abc12345", true, nil); !ready {
		t.Fatal("expected ready after short url")
	}
	if result.ShortURL != "https://public.example/s/abc12345" {
		t.Fatalf("short url = %q", result.ShortURL)
	}
}

func TestHandleServeStderrLineForwardsDeviceChallenge(t *testing.T) {
	cfg := RemoteConfig{}
	var result ServeResult
	var got string

	handleServeStderrLine(cfg, &result, `Device challenge OTP: 123456  expires in 2m`, true, func(line string) {
		got = line
	})

	if got == "" {
		t.Fatal("expected device challenge callback")
	}
	if got != `Device challenge OTP: 123456  expires in 2m` {
		t.Fatalf("unexpected callback line: %q", got)
	}
}

func TestHandleServeStderrLineForwardsDeviceChallengeResult(t *testing.T) {
	cfg := RemoteConfig{}
	var result ServeResult
	var got string

	handleServeStderrLine(cfg, &result, sanitizeServeStderrLine("\x1b[1A\r\x1b[2KDevice challenge result: failed (invalid otp)"), true, func(line string) {
		got = line
	})

	if got == "" {
		t.Fatal("expected device challenge result callback")
	}
	if got != `Device challenge result: failed (invalid otp)` {
		t.Fatalf("unexpected callback line: %q", got)
	}
}
