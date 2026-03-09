package irc

import (
	"net"
	"net/http"
	"testing"
)

func TestAPINotFound(t *testing.T) {
	ts, _, token := setupTestServer(t)

	paths := []string{"/api/unknown", "/api", "/foo"}
	for _, p := range paths {
		resp := doRequest(t, ts, token, "GET", p, nil)
		defer resp.Body.Close()
		if resp.StatusCode != http.StatusNotFound {
			t.Errorf("GET %s: expected 404, got %d", p, resp.StatusCode)
		}
	}
}

func TestAPIRunServer(t *testing.T) {
	dir := t.TempDir()
	store, err := NewStoreWithBaseDir(dir)
	if err != nil {
		t.Fatal(err)
	}

	cfg := ServerConfig{
		Port:  0,
		Store: store,
	}
	gotInfo := runServerForTest(t, cfg)

	if gotInfo.Token == "" {
		t.Error("expected non-empty token")
	}
	if gotInfo.LocalURL == "" {
		t.Error("expected non-empty local URL")
	}
	assertListenHost(t, gotInfo.ListenAddr, defaultServerBindHost)
	if got := localURLHost(t, gotInfo.LocalURL); got != defaultServerAdvertiseHost {
		t.Fatalf("expected default local URL host %q, got %q", defaultServerAdvertiseHost, got)
	}

	req, _ := http.NewRequest("GET", gotInfo.LocalURL+"/api/peers?token="+gotInfo.Token, nil)
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatalf("request to running server: %v", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Errorf("expected 200, got %d", resp.StatusCode)
	}

	if len(gotInfo.Token) != 32 {
		t.Errorf("expected 32-char token, got %d chars", len(gotInfo.Token))
	}
}

func TestAPIShortURLRedirectUsesFragmentConnectURL(t *testing.T) {
	ts, _, token := setupTestServer(t)

	req, err := http.NewRequest(http.MethodGet, ts.URL+"/s/"+shortCodeFromToken(token), nil)
	if err != nil {
		t.Fatalf("NewRequest: %v", err)
	}

	client := &http.Client{
		CheckRedirect: func(req *http.Request, via []*http.Request) error {
			return http.ErrUseLastResponse
		},
	}

	resp, err := client.Do(req)
	if err != nil {
		t.Fatalf("Do: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusFound {
		t.Fatalf("expected 302, got %d", resp.StatusCode)
	}

	wantLocation := DashboardURL(ConnectURL(ts.URL, token))
	if got := resp.Header.Get("Location"); got != wantLocation {
		t.Fatalf("expected redirect to %q, got %q", wantLocation, got)
	}
}

func TestAPIRunServerWithExplicitBindAdvertisesConfiguredHost(t *testing.T) {
	dir := t.TempDir()
	store, err := NewStoreWithBaseDir(dir)
	if err != nil {
		t.Fatal(err)
	}

	bindHost := mustNonLoopbackIPv4(t)

	gotInfo := runServerForTest(t, ServerConfig{
		Port:     0,
		BindHost: bindHost,
		Store:    store,
	})

	assertListenHost(t, gotInfo.ListenAddr, bindHost)
	if got := localURLHost(t, gotInfo.LocalURL); got != bindHost {
		t.Fatalf("expected local URL host %q, got %q", bindHost, got)
	}

	req, _ := http.NewRequest("GET", gotInfo.LocalURL+"/api/peers?token="+gotInfo.Token, nil)
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatalf("request to running server: %v", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Errorf("expected 200, got %d", resp.StatusCode)
	}
}

func TestAPIRunServerWithWildcardBindAdvertisesReachableHost(t *testing.T) {
	dir := t.TempDir()
	store, err := NewStoreWithBaseDir(dir)
	if err != nil {
		t.Fatal(err)
	}

	expectedHost := mustNonLoopbackIPv4(t)

	gotInfo := runServerForTest(t, ServerConfig{
		Port:     0,
		BindHost: "0.0.0.0",
		Store:    store,
	})

	listenIP := net.ParseIP(listenHost(t, gotInfo.ListenAddr))
	if listenIP == nil || !listenIP.IsUnspecified() {
		t.Fatalf("expected wildcard bind to listen on an unspecified address, got %q", gotInfo.ListenAddr)
	}
	if got := localURLHost(t, gotInfo.LocalURL); got != expectedHost {
		t.Fatalf("expected wildcard bind local URL host %q, got %q", expectedHost, got)
	}

	req, _ := http.NewRequest("GET", gotInfo.LocalURL+"/api/peers?token="+gotInfo.Token, nil)
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatalf("request to running server: %v", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Errorf("expected 200, got %d", resp.StatusCode)
	}
}
