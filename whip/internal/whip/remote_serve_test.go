package whip

import "testing"

func TestHandleServeStderrLineCapturesURLs(t *testing.T) {
	cfg := RemoteConfig{}
	var result ServeResult

	if ready := handleServeStderrLine(cfg, &result, "Connect URL: https://public.example#token=abc123", true, nil); !ready {
		t.Fatal("expected ready after connect url without tunnel")
	}
	if result.ConnectURL != "https://public.example#token=abc123" {
		t.Fatalf("connect url = %q", result.ConnectURL)
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

	handleServeStderrLine(cfg, &result, `Device challenge OTP: 123456 (workspace=demo, expires_at=2026-03-10T12:00:00Z, device="Remote Safari")`, true, func(line string) {
		got = line
	})

	if got == "" {
		t.Fatal("expected device challenge callback")
	}
	if got != `Device challenge OTP: 123456 (workspace=demo, expires_at=2026-03-10T12:00:00Z, device="Remote Safari")` {
		t.Fatalf("unexpected callback line: %q", got)
	}
}
