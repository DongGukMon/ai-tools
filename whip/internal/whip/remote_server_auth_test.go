package whip

import (
	"encoding/json"
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

func TestAPIAuthConfigReportsMode(t *testing.T) {
	ts, _, _ := setupTestServer(t)

	resp := doRequest(t, ts, "", http.MethodGet, "/api/auth/config", nil)
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		t.Fatalf("expected 200, got %d", resp.StatusCode)
	}

	var body authConfigResponse
	decodeJSON(t, resp, &body)
	if body.Mode != serverAuthModeToken {
		t.Fatalf("mode = %q, want %q", body.Mode, serverAuthModeToken)
	}
	if body.Workspace != defaultRemoteAuthWorkspace {
		t.Fatalf("workspace = %q, want %q", body.Workspace, defaultRemoteAuthWorkspace)
	}
}

func TestAPIDeviceAuthFlowUsesWhipSessionHeader(t *testing.T) {
	var challengeNotice DeviceAuthChallengeInfo
	var resultNotice DeviceAuthChallengeResultInfo
	ts, _, authStore := setupDeviceTestServerWithCallbacks(
		t,
		"demo",
		func(info DeviceAuthChallengeInfo) {
			challengeNotice = info
		},
		func(info DeviceAuthChallengeResultInfo) {
			resultNotice = info
		},
	)

	resp := doRequest(t, ts, "", http.MethodGet, "/api/peers", nil)
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusUnauthorized {
		t.Fatalf("expected 401 without session, got %d", resp.StatusCode)
	}

	cfgResp := doRequest(t, ts, "", http.MethodGet, "/api/auth/config", nil)
	defer cfgResp.Body.Close()
	if cfgResp.StatusCode != http.StatusOK {
		t.Fatalf("expected 200 for auth config, got %d", cfgResp.StatusCode)
	}
	var cfgBody authConfigResponse
	decodeJSON(t, cfgResp, &cfgBody)
	if cfgBody.Mode != serverAuthModeDevice {
		t.Fatalf("mode = %q, want %q", cfgBody.Mode, serverAuthModeDevice)
	}

	challengeResp := doRequest(t, ts, "", http.MethodPost, "/api/auth/challenges", map[string]string{
		"device_label": "Remote Safari",
	})
	defer challengeResp.Body.Close()
	if challengeResp.StatusCode != http.StatusCreated {
		t.Fatalf("expected 201 from challenge creation, got %d", challengeResp.StatusCode)
	}
	var challengeBody authChallengeResponse
	decodeJSON(t, challengeResp, &challengeBody)
	if challengeBody.ChallengeID == "" {
		t.Fatal("expected challenge id")
	}

	state, err := authStore.LoadState()
	if err != nil {
		t.Fatalf("LoadState: %v", err)
	}
	if state.PendingChallenge == nil {
		t.Fatal("expected pending challenge in store")
	}
	if state.PendingChallenge.OTPHash == "" {
		t.Fatal("expected stored otp hash")
	}
	if challengeNotice.OTP == "" {
		t.Fatal("expected local challenge callback to receive otp")
	}
	if challengeNotice.ChallengeID != challengeBody.ChallengeID {
		t.Fatalf("challenge id = %q, want %q", challengeNotice.ChallengeID, challengeBody.ChallengeID)
	}

	exchangeResp := doRequest(t, ts, "", http.MethodPost, "/api/auth/exchange", map[string]string{
		"challenge_id": challengeBody.ChallengeID,
		"otp":          challengeNotice.OTP,
		"device_label": "Remote Safari",
	})
	defer exchangeResp.Body.Close()
	if exchangeResp.StatusCode != http.StatusCreated {
		t.Fatalf("expected 201 from challenge exchange, got %d", exchangeResp.StatusCode)
	}
	var exchangeBody authExchangeResponse
	decodeJSON(t, exchangeResp, &exchangeBody)
	if exchangeBody.SessionID == "" || exchangeBody.SessionSecret == "" {
		t.Fatalf("expected session credentials, got %+v", exchangeBody)
	}
	if resultNotice.Result != "success" {
		t.Fatalf("result = %q, want success", resultNotice.Result)
	}
	if resultNotice.SessionID != exchangeBody.SessionID {
		t.Fatalf("result session id = %q, want %q", resultNotice.SessionID, exchangeBody.SessionID)
	}

	sessionHeader := "WhipSession " + exchangeBody.SessionID + "." + exchangeBody.SessionSecret
	peersResp := doRequestWithAuthorization(t, ts, sessionHeader, http.MethodGet, "/api/peers", nil)
	defer peersResp.Body.Close()
	if peersResp.StatusCode != http.StatusOK {
		t.Fatalf("expected 200 with device session, got %d", peersResp.StatusCode)
	}
}

func TestAPIDeviceAuthWrongOTPInvalidatesChallenge(t *testing.T) {
	var challengeNotice DeviceAuthChallengeInfo
	var resultNotice DeviceAuthChallengeResultInfo
	ts, _, _ := setupDeviceTestServerWithCallbacks(
		t,
		"demo",
		func(info DeviceAuthChallengeInfo) {
			challengeNotice = info
		},
		func(info DeviceAuthChallengeResultInfo) {
			resultNotice = info
		},
	)

	challengeResp := doRequest(t, ts, "", http.MethodPost, "/api/auth/challenges", map[string]string{
		"device_label": "Laptop",
	})
	defer challengeResp.Body.Close()
	if challengeResp.StatusCode != http.StatusCreated {
		t.Fatalf("expected 201 from challenge creation, got %d", challengeResp.StatusCode)
	}
	var challengeBody authChallengeResponse
	decodeJSON(t, challengeResp, &challengeBody)

	resp := doRequest(t, ts, "", http.MethodPost, "/api/auth/exchange", map[string]string{
		"challenge_id": challengeBody.ChallengeID,
		"otp":          "000000",
		"device_label": "Laptop",
	})
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusUnauthorized {
		t.Fatalf("expected 401 for wrong otp, got %d", resp.StatusCode)
	}
	if resultNotice.Result != "error" {
		t.Fatalf("result = %q, want error", resultNotice.Result)
	}
	if resultNotice.Error != ErrRemoteAuthInvalidOTP.Error() {
		t.Fatalf("error = %q, want %q", resultNotice.Error, ErrRemoteAuthInvalidOTP.Error())
	}

	resp = doRequest(t, ts, "", http.MethodPost, "/api/auth/exchange", map[string]string{
		"challenge_id": challengeBody.ChallengeID,
		"otp":          challengeNotice.OTP,
		"device_label": "Laptop",
	})
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusGone {
		t.Fatalf("expected 410 after invalidation, got %d", resp.StatusCode)
	}
}

func TestAPIDeviceChallengeRateLimit(t *testing.T) {
	ts, _, _ := setupDeviceTestServer(t, "demo")

	var resp *http.Response
	for i := 0; i < RemoteAuthAttemptLimit; i++ {
		resp = doRequest(t, ts, "", http.MethodPost, "/api/auth/challenges", map[string]string{
			"device_label": "Rate Limited Device",
		})
		defer resp.Body.Close()
		if resp.StatusCode != http.StatusCreated {
			t.Fatalf("expected 201 before limit, got %d on attempt %d", resp.StatusCode, i+1)
		}
	}

	resp = doRequest(t, ts, "", http.MethodPost, "/api/auth/challenges", map[string]string{
		"device_label": "Rate Limited Device",
	})
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusTooManyRequests {
		t.Fatalf("expected 429 after limit, got %d", resp.StatusCode)
	}
}

func TestAPIDeviceChallengeInvokesLocalCallback(t *testing.T) {
	var challengeNotice DeviceAuthChallengeInfo
	ts, _, _ := setupDeviceTestServerWithCallback(t, "demo", func(info DeviceAuthChallengeInfo) {
		challengeNotice = info
	})

	resp := doRequest(t, ts, "", http.MethodPost, "/api/auth/challenges", map[string]string{
		"device_label": "Remote Safari",
	})
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusCreated {
		t.Fatalf("expected 201, got %d", resp.StatusCode)
	}

	var body authChallengeResponse
	decodeJSON(t, resp, &body)
	if challengeNotice.OTP == "" {
		t.Fatal("expected otp in local callback")
	}
	if challengeNotice.ChallengeID != body.ChallengeID {
		t.Fatalf("challenge id = %q, want %q", challengeNotice.ChallengeID, body.ChallengeID)
	}
	if challengeNotice.Workspace != "demo" {
		t.Fatalf("workspace = %q, want %q", challengeNotice.Workspace, "demo")
	}
}

func TestAPIDeviceAuthRejectsLegacyQueryToken(t *testing.T) {
	ts, _, _ := setupDeviceTestServer(t, "demo")

	resp := doRequest(t, ts, "", http.MethodGet, "/api/peers?token=test-token-abc123", nil)
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusUnauthorized {
		t.Fatalf("expected 401 for legacy query token in device mode, got %d", resp.StatusCode)
	}
}

func TestAPIDeviceChallengeResponseDoesNotExposeOTP(t *testing.T) {
	ts, _, _ := setupDeviceTestServer(t, "demo")

	resp := doRequest(t, ts, "", http.MethodPost, "/api/auth/challenges", map[string]string{
		"device_label": "Remote Safari",
	})
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusCreated {
		t.Fatalf("expected 201, got %d", resp.StatusCode)
	}

	var payload map[string]any
	if err := json.NewDecoder(resp.Body).Decode(&payload); err != nil {
		t.Fatalf("decode JSON: %v", err)
	}
	if _, ok := payload["otp"]; ok {
		t.Fatal("challenge response must not expose raw otp")
	}
}
