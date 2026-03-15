package whip

import (
	"net/http"
	"strings"
	"testing"
)

func TestAPIMasterKeysRejectsOversizedBody(t *testing.T) {
	ts, _, token := setupTestServerWithMaster(t, "master-session")

	resp := doRequest(t, ts, token, "POST", "/api/master/keys", map[string]string{
		"keys": strings.Repeat("a", int(maxHTTPJSONBodyBytes)),
	})
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusRequestEntityTooLarge {
		t.Fatalf("expected 413, got %d", resp.StatusCode)
	}

	var body map[string]string
	decodeJSON(t, resp, &body)
	if body["error"] != "request body too large" {
		t.Fatalf("unexpected error: %q", body["error"])
	}
}

func TestAPIMasterStatusRejectsQueryAuth(t *testing.T) {
	ts, _, token := setupTestServerWithMaster(t, "master-session")

	resp := doRequest(t, ts, "", "GET", "/api/master/status?token="+token, nil)
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusUnauthorized {
		t.Fatalf("expected 401, got %d", resp.StatusCode)
	}
}

func TestAPIMasterKeysRejectsQueryAuth(t *testing.T) {
	ts, _, token := setupTestServerWithMaster(t, "master-session")

	resp := doRequest(t, ts, "", "POST", "/api/master/keys?token="+token, map[string]string{
		"keys": "whoami",
	})
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusUnauthorized {
		t.Fatalf("expected 401, got %d", resp.StatusCode)
	}
}

func TestAPIMasterKeysRejectsOversizedKeys(t *testing.T) {
	ts, _, token := setupTestServerWithMaster(t, "master-session")

	keys := strings.Repeat("a", maxHTTPMasterKeysSize+1)
	resp := doRequest(t, ts, token, "POST", "/api/master/keys", map[string]string{
		"keys": keys,
	})
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d", resp.StatusCode)
	}

	var body map[string]string
	decodeJSON(t, resp, &body)
	want := "keys too large (10241 bytes, max 10240 bytes)"
	if body["error"] != want {
		t.Fatalf("unexpected error: %q", body["error"])
	}
}
