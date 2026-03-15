package whip

import (
	"context"
	"fmt"
	"net"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"testing"
	"time"
)

func TestServeURLs_LocalConnectURLUsesFragmentToken(t *testing.T) {
	info := ServerInfo{
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
	info := ServerInfo{
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

func TestServeURLs_DeviceModeUsesModeFragment(t *testing.T) {
	info := ServerInfo{
		AuthMode:  RemoteAuthModeDevice,
		Workspace: "demo",
		ShortCode: "abc12345",
		LocalURL:  "http://localhost:8585",
	}

	connectURL, shortURL, webURL := serveURLs(info, "https://public.example")

	if connectURL != "https://public.example#mode=device" {
		t.Fatalf("unexpected connect URL: %q", connectURL)
	}
	if shortURL != "https://public.example/s/abc12345" {
		t.Fatalf("unexpected short URL: %q", shortURL)
	}
	if webURL != "https://whip.bang9.dev#https://public.example#mode=device" {
		t.Fatalf("unexpected web URL: %q", webURL)
	}
}

func TestFormatDeviceChallengeLogLine(t *testing.T) {
	line := formatDeviceChallengeLogLine(DeviceAuthChallengeInfo{
		OTP:       "123456",
		CreatedAt: time.Date(2026, 3, 10, 11, 58, 0, 0, time.UTC),
		ExpiresAt: time.Date(2026, 3, 10, 12, 0, 0, 0, time.UTC),
	})

	if !strings.HasPrefix(line, deviceChallengeLogPrefix) {
		t.Fatalf("expected prefix %q, got %q", deviceChallengeLogPrefix, line)
	}
	if !strings.Contains(line, "123456") {
		t.Fatalf("expected otp in line, got %q", line)
	}
	if !strings.Contains(line, "expires in 2m") {
		t.Fatalf("expected ttl in line, got %q", line)
	}
}

func TestFormatDeviceChallengeResultLogLine(t *testing.T) {
	line := formatDeviceChallengeResultLogLine(DeviceAuthChallengeResultInfo{
		Result: "error",
		Error:  "invalid otp",
	})

	if !strings.HasPrefix(line, deviceChallengeResultLogPrefix) {
		t.Fatalf("expected prefix %q, got %q", deviceChallengeResultLogPrefix, line)
	}
	if !strings.Contains(line, "failed (invalid otp)") {
		t.Fatalf("expected result in line, got %q", line)
	}
}

func TestStartServeStartsAndStopsRemoteServer(t *testing.T) {
	handle, result, err := StartServe(context.Background(), RemoteConfig{
		Port:     0,
		AuthMode: RemoteAuthModeToken,
	}, "", true, nil)
	if err != nil {
		t.Fatalf("StartServe: %v", err)
	}

	baseURL, token := connectBaseURLAndToken(t, result.ConnectURL)
	if status := remoteServerStatus(t, baseURL+"/api/peers", token); status != http.StatusOK {
		t.Fatalf("expected running server to return 200, got %d", status)
	}

	if err := handle.Stop(500 * time.Millisecond); err != nil {
		t.Fatalf("Stop: %v", err)
	}
	if exited, err := handle.Exited(); !exited || err != nil {
		t.Fatalf("expected stopped handle with nil error, got exited=%v err=%v", exited, err)
	}
}

func TestStartServePassesBindHostToRunningServer(t *testing.T) {
	bindHost := mustNonLoopbackIPv4(t)

	handle, result, err := StartServe(context.Background(), RemoteConfig{
		Port:     0,
		BindHost: bindHost,
		AuthMode: RemoteAuthModeToken,
	}, "", true, nil)
	if err != nil {
		t.Fatalf("StartServe: %v", err)
	}
	t.Cleanup(func() {
		_ = handle.Stop(500 * time.Millisecond)
	})

	baseURL, token := connectBaseURLAndToken(t, result.ConnectURL)
	if got := localURLHost(t, baseURL); got != bindHost {
		t.Fatalf("expected connect URL host %q, got %q", bindHost, got)
	}
	if status := remoteServerStatus(t, baseURL+"/api/peers", token); status != http.StatusOK {
		t.Fatalf("expected running server to return 200, got %d", status)
	}
}

func TestStartServeForceStopsStuckRequestAndAllowsRestart(t *testing.T) {
	port := freeTCPPort(t)

	blocked := make(chan struct{})
	release := make(chan struct{})
	var blockOnce sync.Once

	handle, result, err := StartServe(context.Background(), RemoteConfig{
		Port:     port,
		AuthMode: RemoteAuthModeToken,
		testHandlerWrapper: func(next http.Handler) http.Handler {
			return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				if r.Method == http.MethodGet && r.URL.Path == "/api/peers" {
					blockOnce.Do(func() {
						close(blocked)
					})
					<-release
					return
				}
				next.ServeHTTP(w, r)
			})
		},
	}, "", true, nil)
	if err != nil {
		t.Fatalf("StartServe: %v", err)
	}

	baseURL, token := connectBaseURLAndToken(t, result.ConnectURL)
	reqErrCh := make(chan error, 1)
	go func() {
		req, err := http.NewRequest(http.MethodGet, baseURL+"/api/peers", nil)
		if err != nil {
			reqErrCh <- err
			return
		}
		req.Header.Set("Authorization", "Bearer "+token)

		resp, err := http.DefaultClient.Do(req)
		if resp != nil {
			resp.Body.Close()
		}
		if err == nil {
			err = fmt.Errorf("expected active request to fail after forced stop")
		}
		reqErrCh <- err
	}()

	select {
	case <-blocked:
	case <-time.After(2 * time.Second):
		t.Fatal("stuck request did not start")
	}

	stopStarted := time.Now()
	if err := handle.Stop(50 * time.Millisecond); err != nil {
		t.Fatalf("Stop: %v", err)
	}
	if elapsed := time.Since(stopStarted); elapsed > time.Second {
		t.Fatalf("expected bounded stop, took %v", elapsed)
	}
	close(release)

	select {
	case err := <-reqErrCh:
		if err == nil {
			t.Fatal("expected blocked request to fail")
		}
	case <-time.After(2 * time.Second):
		t.Fatal("blocked request did not fail after stop")
	}

	restarted, restartedResult, err := StartServe(context.Background(), RemoteConfig{
		Port:     port,
		AuthMode: RemoteAuthModeToken,
	}, "", true, nil)
	if err != nil {
		t.Fatalf("restart StartServe: %v", err)
	}
	t.Cleanup(func() {
		_ = restarted.Stop(500 * time.Millisecond)
	})

	restartBaseURL, restartToken := connectBaseURLAndToken(t, restartedResult.ConnectURL)
	if status := remoteServerStatus(t, restartBaseURL+"/api/peers", restartToken); status != http.StatusOK {
		t.Fatalf("expected restarted server to return 200, got %d", status)
	}
}

func connectBaseURLAndToken(t *testing.T, connectURL string) (string, string) {
	t.Helper()

	parsed, err := url.Parse(connectURL)
	if err != nil {
		t.Fatalf("url.Parse(%q): %v", connectURL, err)
	}
	fragment, err := url.ParseQuery(parsed.Fragment)
	if err != nil {
		t.Fatalf("url.ParseQuery(%q): %v", parsed.Fragment, err)
	}
	parsed.RawQuery = ""
	parsed.Fragment = ""
	return parsed.String(), fragment.Get("token")
}

func remoteServerStatus(t *testing.T, rawURL, token string) int {
	t.Helper()

	req, err := http.NewRequest(http.MethodGet, rawURL, nil)
	if err != nil {
		t.Fatalf("NewRequest(%q): %v", rawURL, err)
	}
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatalf("Do(%q): %v", rawURL, err)
	}
	defer resp.Body.Close()
	return resp.StatusCode
}

func freeTCPPort(t *testing.T) int {
	t.Helper()

	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatalf("net.Listen: %v", err)
	}
	defer listener.Close()

	_, port, err := net.SplitHostPort(listener.Addr().String())
	if err != nil {
		t.Fatalf("SplitHostPort(%q): %v", listener.Addr().String(), err)
	}
	value, err := url.Parse("http://127.0.0.1:" + port)
	if err != nil {
		t.Fatalf("url.Parse port %q: %v", port, err)
	}
	return mustPortNumber(t, value.Host)
}

func mustPortNumber(t *testing.T, hostPort string) int {
	t.Helper()

	_, port, err := net.SplitHostPort(hostPort)
	if err != nil {
		t.Fatalf("SplitHostPort(%q): %v", hostPort, err)
	}
	value, err := net.LookupPort("tcp", port)
	if err != nil {
		t.Fatalf("LookupPort(%q): %v", port, err)
	}
	return value
}
