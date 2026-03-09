package irc

import (
	"net/http"
	"testing"
)

func TestAPIAuthBearerToken(t *testing.T) {
	ts, _, token := setupTestServer(t)
	resp := doRequest(t, ts, token, "GET", "/api/peers", nil)
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Errorf("expected 200, got %d", resp.StatusCode)
	}
}

func TestAPIAuthQueryParamPeers(t *testing.T) {
	ts, _, token := setupTestServer(t)
	resp := doRequest(t, ts, "", "GET", "/api/peers?token="+token, nil)
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Errorf("expected 200, got %d", resp.StatusCode)
	}
}

func TestAPIAuthQueryParamTasks(t *testing.T) {
	ts, _, token := setupTestServer(t)
	resp := doRequest(t, ts, "", "GET", "/api/tasks?token="+token, nil)
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Errorf("expected 200, got %d", resp.StatusCode)
	}
}

func TestAPIAuthQueryParamRejectsMessages(t *testing.T) {
	ts, _, token := setupTestServer(t)
	resp := doRequest(t, ts, "", "GET", "/api/messages/user?token="+token, nil)
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusUnauthorized {
		t.Errorf("expected 401, got %d", resp.StatusCode)
	}
}

func TestAPIAuthQueryParamRejectsMutatingEndpoints(t *testing.T) {
	ts, _, token := setupTestServer(t)
	resp := doRequest(t, ts, "", "POST", "/api/messages?token="+token, map[string]string{
		"from":    "user",
		"to":      "alice",
		"content": "hello",
	})
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusUnauthorized {
		t.Errorf("expected 401, got %d", resp.StatusCode)
	}
}

func TestAPIAuthMissingToken(t *testing.T) {
	ts, _, _ := setupTestServer(t)
	resp := doRequest(t, ts, "", "GET", "/api/peers", nil)
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusUnauthorized {
		t.Errorf("expected 401, got %d", resp.StatusCode)
	}
	var body map[string]string
	decodeJSON(t, resp, &body)
	if body["error"] != "unauthorized" {
		t.Errorf("expected error 'unauthorized', got %q", body["error"])
	}
}

func TestAPIAuthWrongToken(t *testing.T) {
	ts, _, _ := setupTestServer(t)
	resp := doRequest(t, ts, "wrong-token", "GET", "/api/peers", nil)
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusUnauthorized {
		t.Errorf("expected 401, got %d", resp.StatusCode)
	}
}

func TestAPICORSAllowedOrigin(t *testing.T) {
	ts, _, token := setupTestServer(t)

	req, _ := http.NewRequest("GET", ts.URL+"/api/peers", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Origin", "https://whip.bang9.dev")
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()

	if got := resp.Header.Get("Access-Control-Allow-Origin"); got != "https://whip.bang9.dev" {
		t.Errorf("expected ACAO 'https://whip.bang9.dev', got %q", got)
	}
}

func TestAPICORSLocalhostAllowed(t *testing.T) {
	ts, _, token := setupTestServer(t)

	req, _ := http.NewRequest("GET", ts.URL+"/api/peers", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Origin", "http://localhost:3000")
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()

	if got := resp.Header.Get("Access-Control-Allow-Origin"); got != "http://localhost:3000" {
		t.Errorf("expected ACAO 'http://localhost:3000', got %q", got)
	}
}

func TestAPICORSRejectedOrigin(t *testing.T) {
	ts, _, token := setupTestServer(t)

	req, _ := http.NewRequest("GET", ts.URL+"/api/peers", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Origin", "https://evil.example.com")
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()

	if got := resp.Header.Get("Access-Control-Allow-Origin"); got != "" {
		t.Errorf("expected no ACAO header, got %q", got)
	}
}

func TestAPICORSPreflight(t *testing.T) {
	ts, _, _ := setupTestServer(t)

	req, _ := http.NewRequest("OPTIONS", ts.URL+"/api/peers", nil)
	req.Header.Set("Origin", "https://whip.bang9.dev")
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusNoContent {
		t.Errorf("expected 204, got %d", resp.StatusCode)
	}
}

func TestAPICORSPreflightRejected(t *testing.T) {
	ts, _, _ := setupTestServer(t)

	req, _ := http.NewRequest("OPTIONS", ts.URL+"/api/peers", nil)
	req.Header.Set("Origin", "https://evil.example.com")
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusForbidden {
		t.Errorf("expected 403 for rejected preflight, got %d", resp.StatusCode)
	}
}
