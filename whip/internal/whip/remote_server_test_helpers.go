package whip

import (
	"bytes"
	"context"
	"encoding/json"
	"net"
	"net/http"
	"net/http/httptest"
	"net/url"
	"path/filepath"
	"testing"
	"time"

	agentirc "github.com/bang9/ai-tools/shared/agentirc"
)

type RemoteIRCStore = agentirc.Store

func setupTestServer(t *testing.T) (*httptest.Server, *RemoteIRCStore, string) {
	t.Helper()
	dir := t.TempDir()
	store, err := agentirc.NewStoreWithBaseDir(dir)
	if err != nil {
		t.Fatalf("agentirc.NewStoreWithBaseDir: %v", err)
	}

	token := "test-token-abc123"
	handler := buildHandler(store, serverAuthConfig{
		Mode:      serverAuthModeToken,
		Token:     token,
		Workspace: defaultRemoteAuthWorkspace,
	}, shortCodeFromToken(token), "")
	ts := httptest.NewServer(handler)
	t.Cleanup(ts.Close)

	return ts, store, token
}

func setupTestServerWithMaster(t *testing.T, masterTmux string) (*httptest.Server, *RemoteIRCStore, string) {
	t.Helper()
	dir := t.TempDir()
	store, err := agentirc.NewStoreWithBaseDir(dir)
	if err != nil {
		t.Fatalf("agentirc.NewStoreWithBaseDir: %v", err)
	}

	token := "test-token-abc123"
	handler := buildHandler(store, serverAuthConfig{
		Mode:      serverAuthModeToken,
		Token:     token,
		Workspace: defaultRemoteAuthWorkspace,
	}, shortCodeFromToken(token), masterTmux)
	ts := httptest.NewServer(handler)
	t.Cleanup(ts.Close)

	return ts, store, token
}

func setupDeviceTestServer(t *testing.T, workspace string) (*httptest.Server, *RemoteIRCStore, *RemoteAuthStore) {
	t.Helper()
	return setupDeviceTestServerWithCallbacks(t, workspace, nil, nil)
}

func setupDeviceTestServerWithCallback(t *testing.T, workspace string, onDeviceChallenge func(DeviceAuthChallengeInfo)) (*httptest.Server, *RemoteIRCStore, *RemoteAuthStore) {
	t.Helper()
	return setupDeviceTestServerWithCallbacks(t, workspace, onDeviceChallenge, nil)
}

func setupDeviceTestServerWithCallbacks(
	t *testing.T,
	workspace string,
	onDeviceChallenge func(DeviceAuthChallengeInfo),
	onDeviceChallengeResult func(DeviceAuthChallengeResultInfo),
) (*httptest.Server, *RemoteIRCStore, *RemoteAuthStore) {
	t.Helper()

	tmpHome := t.TempDir()
	t.Setenv("HOME", tmpHome)
	t.Setenv("WHIP_HOME", filepath.Join(tmpHome, whipDir))

	dir := t.TempDir()
	store, err := agentirc.NewStoreWithBaseDir(dir)
	if err != nil {
		t.Fatalf("agentirc.NewStoreWithBaseDir: %v", err)
	}

	authStore, err := NewRemoteAuthStore(workspace)
	if err != nil {
		t.Fatalf("NewRemoteAuthStore: %v", err)
	}

	handler := buildHandler(store, serverAuthConfig{
		Mode:                    serverAuthModeDevice,
		Workspace:               authStore.Workspace,
		RemoteAuth:              authStore,
		OnDeviceChallenge:       onDeviceChallenge,
		OnDeviceChallengeResult: onDeviceChallengeResult,
	}, "devicecode", "")
	ts := httptest.NewServer(handler)
	t.Cleanup(ts.Close)

	return ts, store, authStore
}

func doRequest(t *testing.T, ts *httptest.Server, token, method, path string, body interface{}) *http.Response {
	t.Helper()
	authHeader := ""
	if token != "" {
		authHeader = "Bearer " + token
	}
	return doRequestWithAuthorization(t, ts, authHeader, method, path, body)
}

func doRequestWithAuthorization(t *testing.T, ts *httptest.Server, authHeader, method, path string, body interface{}) *http.Response {
	t.Helper()
	var reqBody *bytes.Buffer
	if body != nil {
		data, _ := json.Marshal(body)
		reqBody = bytes.NewBuffer(data)
	} else {
		reqBody = bytes.NewBuffer(nil)
	}

	req, err := http.NewRequest(method, ts.URL+path, reqBody)
	if err != nil {
		t.Fatalf("NewRequest: %v", err)
	}
	if authHeader != "" {
		req.Header.Set("Authorization", authHeader)
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatalf("Do: %v", err)
	}
	return resp
}

func decodeJSON(t *testing.T, resp *http.Response, v interface{}) {
	t.Helper()
	defer resp.Body.Close()
	if err := json.NewDecoder(resp.Body).Decode(v); err != nil {
		t.Fatalf("decode JSON: %v", err)
	}
}

func runServerForTest(t *testing.T, cfg ServerConfig) ServerInfo {
	t.Helper()

	var gotInfo ServerInfo
	ready := make(chan struct{})
	cfg.OnReady = func(info ServerInfo) {
		gotInfo = info
		close(ready)
	}

	ctx, cancel := context.WithCancel(context.Background())
	errCh := make(chan error, 1)
	go func() {
		errCh <- RunServer(ctx, cfg)
	}()

	select {
	case <-ready:
	case <-time.After(3 * time.Second):
		cancel()
		t.Fatal("server did not become ready in time")
	}

	t.Cleanup(func() {
		cancel()
		select {
		case err := <-errCh:
			if err != nil {
				t.Errorf("RunServer returned error: %v", err)
			}
		case <-time.After(3 * time.Second):
			t.Error("server did not shut down in time")
		}
	})

	return gotInfo
}

func assertListenHost(t *testing.T, listenAddr, wantHost string) {
	t.Helper()

	gotHost, _, err := net.SplitHostPort(listenAddr)
	if err != nil {
		t.Fatalf("SplitHostPort(%q): %v", listenAddr, err)
	}
	if gotHost != wantHost {
		t.Fatalf("expected listen host %q, got %q", wantHost, gotHost)
	}
}

func listenHost(t *testing.T, listenAddr string) string {
	t.Helper()

	host, _, err := net.SplitHostPort(listenAddr)
	if err != nil {
		t.Fatalf("SplitHostPort(%q): %v", listenAddr, err)
	}
	return host
}

func localURLHost(t *testing.T, localURL string) string {
	t.Helper()

	parsed, err := url.Parse(localURL)
	if err != nil {
		t.Fatalf("url.Parse(%q): %v", localURL, err)
	}
	host, _, err := net.SplitHostPort(parsed.Host)
	if err != nil {
		t.Fatalf("SplitHostPort(%q): %v", parsed.Host, err)
	}
	return host
}

func mustNonLoopbackIPv4(t *testing.T) string {
	t.Helper()

	host, ok := firstNonLoopbackInterfaceAddr(false)
	if !ok {
		t.Skip("no non-loopback IPv4 interface available for explicit bind test")
	}
	return host
}
