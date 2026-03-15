package whip

import (
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func TestNewRemoteAuthStoreUsesWHIPHOME(t *testing.T) {
	tmpHome := t.TempDir()
	t.Setenv("HOME", tmpHome)

	override := filepath.Join(tmpHome, whipDir, "installs", "primary")
	t.Setenv("WHIP_HOME", override)

	store, err := NewRemoteAuthStore("issue-sweep")
	if err != nil {
		t.Fatalf("NewRemoteAuthStore: %v", err)
	}

	wantRoot, err := canonicalizeStorePath(override)
	if err != nil {
		t.Fatalf("canonicalizeStorePath: %v", err)
	}
	wantPath := filepath.Join(wantRoot, remoteAuthDirName, "issue-sweep.json")
	if store.Path != wantPath {
		t.Fatalf("Path = %q, want %q", store.Path, wantPath)
	}
}

func TestRemoteAuthStoreCreateChallengeHashesOTP(t *testing.T) {
	store := newTestRemoteAuthStore(t, "demo")
	now := time.Now().UTC().Truncate(time.Second)

	challenge, otp, err := store.CreateChallenge(now, RemoteAuthOrigin{UserAgent: "Safari"}, "")
	if err != nil {
		t.Fatalf("CreateChallenge: %v", err)
	}
	if otp == "" {
		t.Fatal("expected raw otp")
	}
	if challenge.ChallengeID == "" {
		t.Fatal("expected challenge id")
	}
	if challenge.OTPHash != hashRemoteAuthValue(otp) {
		t.Fatalf("OTP hash mismatch: got %q", challenge.OTPHash)
	}

	state, err := store.LoadState()
	if err != nil {
		t.Fatalf("LoadState: %v", err)
	}
	if state.PendingChallenge == nil {
		t.Fatal("expected pending challenge")
	}
	if state.PendingChallenge.OTPHash != hashRemoteAuthValue(otp) {
		t.Fatalf("stored otp hash mismatch: got %q", state.PendingChallenge.OTPHash)
	}

	data, err := os.ReadFile(store.Path)
	if err != nil {
		t.Fatalf("ReadFile: %v", err)
	}
	if strings.Contains(string(data), otp) {
		t.Fatal("remote auth file must not persist raw otp")
	}
}

func TestRemoteAuthStoreWrongOTPInvalidatesChallenge(t *testing.T) {
	store := newTestRemoteAuthStore(t, "demo")
	now := time.Now().UTC().Add(-30 * time.Second).Truncate(time.Second)

	challenge, otp, err := store.CreateChallenge(now, RemoteAuthOrigin{UserAgent: "Firefox"}, "")
	if err != nil {
		t.Fatalf("CreateChallenge: %v", err)
	}

	_, _, err = store.ExchangeChallenge(now.Add(10*time.Second), challenge.ChallengeID, "000000", "Laptop")
	if !errors.Is(err, ErrRemoteAuthInvalidOTP) {
		t.Fatalf("ExchangeChallenge wrong otp error = %v, want %v", err, ErrRemoteAuthInvalidOTP)
	}

	state, err := store.LoadState()
	if err != nil {
		t.Fatalf("LoadState: %v", err)
	}
	if state.PendingChallenge == nil || !state.PendingChallenge.Failed || state.PendingChallenge.FailedAt == nil {
		t.Fatalf("expected failed challenge after wrong otp: %+v", state.PendingChallenge)
	}

	_, _, err = store.ExchangeChallenge(now.Add(20*time.Second), challenge.ChallengeID, otp, "Laptop")
	if !errors.Is(err, ErrRemoteAuthChallengeFailed) {
		t.Fatalf("ExchangeChallenge after invalidation error = %v, want %v", err, ErrRemoteAuthChallengeFailed)
	}
}

func TestRemoteAuthStoreExchangeCreatesHashedSession(t *testing.T) {
	store := newTestRemoteAuthStore(t, "demo")
	now := time.Now().UTC().Add(-30 * time.Second).Truncate(time.Second)

	challenge, otp, err := store.CreateChallenge(now, RemoteAuthOrigin{UserAgent: "Chrome"}, "MacBook Pro")
	if err != nil {
		t.Fatalf("CreateChallenge: %v", err)
	}

	session, sessionSecret, err := store.ExchangeChallenge(now.Add(30*time.Second), challenge.ChallengeID, otp, "MacBook Pro")
	if err != nil {
		t.Fatalf("ExchangeChallenge: %v", err)
	}
	if sessionSecret == "" {
		t.Fatal("expected raw session secret")
	}
	if session.SessionSecretHash != hashRemoteAuthValue(sessionSecret) {
		t.Fatalf("session secret hash mismatch: got %q", session.SessionSecretHash)
	}

	state, err := store.LoadState()
	if err != nil {
		t.Fatalf("LoadState: %v", err)
	}
	if state.PendingChallenge == nil || !state.PendingChallenge.Used || state.PendingChallenge.UsedAt == nil {
		t.Fatalf("expected used challenge after exchange: %+v", state.PendingChallenge)
	}
	if len(state.Sessions) != 1 {
		t.Fatalf("expected one session, got %d", len(state.Sessions))
	}
	if state.Sessions[0].SessionSecretHash != hashRemoteAuthValue(sessionSecret) {
		t.Fatalf("stored session hash mismatch: got %q", state.Sessions[0].SessionSecretHash)
	}

	data, err := os.ReadFile(store.Path)
	if err != nil {
		t.Fatalf("ReadFile: %v", err)
	}
	if strings.Contains(string(data), sessionSecret) {
		t.Fatal("remote auth file must not persist raw session secret")
	}
}

func TestRemoteAuthStoreAuthenticateSessionRefreshPolicy(t *testing.T) {
	store := newTestRemoteAuthStore(t, "demo")
	start := time.Date(2026, 3, 9, 12, 0, 0, 0, time.UTC)

	challenge, otp, err := store.CreateChallenge(start, RemoteAuthOrigin{UserAgent: "Chrome"}, "iPhone")
	if err != nil {
		t.Fatalf("CreateChallenge: %v", err)
	}
	session, sessionSecret, err := store.ExchangeChallenge(start.Add(time.Minute), challenge.ChallengeID, otp, "iPhone")
	if err != nil {
		t.Fatalf("ExchangeChallenge: %v", err)
	}

	firstSeen := start.Add(30 * time.Hour)
	refreshed, err := store.AuthenticateSession(firstSeen, session.SessionID, sessionSecret)
	if err != nil {
		t.Fatalf("AuthenticateSession first: %v", err)
	}
	if !refreshed.LastSeenAt.Equal(firstSeen) {
		t.Fatalf("LastSeenAt = %v, want %v", refreshed.LastSeenAt, firstSeen)
	}
	if !refreshed.ExpiresAt.Equal(session.ExpiresAt) {
		t.Fatalf("ExpiresAt changed too early: got %v want %v", refreshed.ExpiresAt, session.ExpiresAt)
	}

	secondSeen := start.Add(50 * time.Hour)
	refreshed, err = store.AuthenticateSession(secondSeen, session.SessionID, sessionSecret)
	if err != nil {
		t.Fatalf("AuthenticateSession second: %v", err)
	}
	if !refreshed.LastSeenAt.Equal(secondSeen) {
		t.Fatalf("LastSeenAt = %v, want %v", refreshed.LastSeenAt, secondSeen)
	}
	wantExpiry := secondSeen.Add(RemoteAuthSessionTTL)
	if !refreshed.ExpiresAt.Equal(wantExpiry) {
		t.Fatalf("ExpiresAt = %v, want %v", refreshed.ExpiresAt, wantExpiry)
	}
}

func TestRemoteAuthStoreCreateChallengeRateLimitPerDevice(t *testing.T) {
	store := newTestRemoteAuthStore(t, "demo")
	start := time.Date(2026, 3, 9, 12, 0, 0, 0, time.UTC)
	origin := RemoteAuthOrigin{
		RemoteAddr: "203.0.113.10:4242",
		UserAgent:  "Safari",
	}

	for i := 0; i < RemoteAuthAttemptLimit; i++ {
		if _, _, err := store.CreateChallenge(start.Add(time.Duration(i)*time.Hour), origin, "iPhone Safari"); err != nil {
			t.Fatalf("CreateChallenge #%d: %v", i+1, err)
		}
	}

	if _, _, err := store.CreateChallenge(start.Add(5*time.Hour), origin, "iPhone Safari"); !errors.Is(err, ErrRemoteAuthChallengeRateLimited) {
		t.Fatalf("CreateChallenge rate limit error = %v, want %v", err, ErrRemoteAuthChallengeRateLimited)
	}

	if _, _, err := store.CreateChallenge(start.Add(25*time.Hour), origin, "iPhone Safari"); err != nil {
		t.Fatalf("CreateChallenge after window reset: %v", err)
	}

	data, err := os.ReadFile(store.Path)
	if err != nil {
		t.Fatalf("ReadFile: %v", err)
	}
	var state RemoteAuthState
	if err := json.Unmarshal(data, &state); err != nil {
		t.Fatalf("Unmarshal: %v", err)
	}
	if len(state.Attempts) != RemoteAuthAttemptLimit {
		t.Fatalf("attempt count = %d, want %d", len(state.Attempts), RemoteAuthAttemptLimit)
	}
}

func TestRemoteAuthStorePrunesExpiredRecords(t *testing.T) {
	store := newTestRemoteAuthStore(t, "demo")
	start := time.Date(2000, 1, 1, 12, 0, 0, 0, time.UTC)

	challenge, otp, err := store.CreateChallenge(start, RemoteAuthOrigin{UserAgent: "Chrome"}, "Old Device")
	if err != nil {
		t.Fatalf("CreateChallenge: %v", err)
	}
	session, sessionSecret, err := store.ExchangeChallenge(start.Add(time.Minute), challenge.ChallengeID, otp, "Old Device")
	if err != nil {
		t.Fatalf("ExchangeChallenge: %v", err)
	}

	_, err = store.AuthenticateSession(start.Add(RemoteAuthSessionTTL+time.Hour), session.SessionID, sessionSecret)
	if !errors.Is(err, ErrRemoteAuthSessionExpired) {
		t.Fatalf("AuthenticateSession expired error = %v, want %v", err, ErrRemoteAuthSessionExpired)
	}

	state, err := store.LoadState()
	if err != nil {
		t.Fatalf("LoadState: %v", err)
	}
	if state.PendingChallenge != nil {
		t.Fatalf("expected expired challenge to be pruned, got %+v", state.PendingChallenge)
	}
	if len(state.Sessions) != 0 {
		t.Fatalf("expected expired session to be pruned, got %d session(s)", len(state.Sessions))
	}
	if len(state.Attempts) != 0 {
		t.Fatalf("expected expired attempts to be pruned, got %d attempt(s)", len(state.Attempts))
	}
}

func newTestRemoteAuthStore(t *testing.T, workspace string) *RemoteAuthStore {
	t.Helper()

	whipRoot := filepath.Join(t.TempDir(), whipDir)
	store, err := NewRemoteAuthStoreWithRoot(whipRoot, workspace)
	if err != nil {
		t.Fatalf("NewRemoteAuthStoreWithRoot: %v", err)
	}
	return store
}
