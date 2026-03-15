package whip

import (
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"math/big"
	"net"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"syscall"
	"time"
)

const (
	remoteAuthDirName           = "remote-auth"
	defaultRemoteAuthWorkspace  = "global"
	RemoteAuthChallengeTTL      = 120 * time.Second
	RemoteAuthAttemptWindow     = 24 * time.Hour
	RemoteAuthAttemptLimit      = 5
	RemoteAuthSessionTTL        = 72 * time.Hour
	RemoteAuthSessionRefreshTTL = 24 * time.Hour
)

var remoteAuthWorkspacePattern = regexp.MustCompile(`^[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?$`)

var (
	ErrRemoteAuthNoChallenge          = errors.New("no pending auth challenge")
	ErrRemoteAuthChallengeUsed        = errors.New("auth challenge already used")
	ErrRemoteAuthChallengeFailed      = errors.New("auth challenge already invalidated")
	ErrRemoteAuthChallengeExpired     = errors.New("auth challenge expired")
	ErrRemoteAuthChallengeRateLimited = errors.New("otp attempt limit reached for this device")
	ErrRemoteAuthInvalidOTP           = errors.New("invalid otp")
	ErrRemoteAuthSessionNotFound      = errors.New("device session not found")
	ErrRemoteAuthSessionRevoked       = errors.New("device session revoked")
	ErrRemoteAuthSessionExpired       = errors.New("device session expired")
)

type RemoteAuthStore struct {
	Workspace string
	Path      string
	lockPath  string
}

type RemoteAuthState struct {
	Workspace        string               `json:"workspace"`
	PendingChallenge *RemoteAuthChallenge `json:"pending_challenge,omitempty"`
	Attempts         []RemoteAuthAttempt  `json:"attempts,omitempty"`
	Sessions         []RemoteAuthSession  `json:"sessions,omitempty"`
	UpdatedAt        time.Time            `json:"updated_at,omitempty"`
}

type RemoteAuthChallenge struct {
	ChallengeID string           `json:"challenge_id"`
	OTPHash     string           `json:"otp_hash"`
	CreatedAt   time.Time        `json:"created_at"`
	ExpiresAt   time.Time        `json:"expires_at"`
	Origin      RemoteAuthOrigin `json:"origin,omitempty"`
	DeviceLabel string           `json:"device_label,omitempty"`
	Failed      bool             `json:"failed"`
	FailedAt    *time.Time       `json:"failed_at,omitempty"`
	Used        bool             `json:"used"`
	UsedAt      *time.Time       `json:"used_at,omitempty"`
}

type RemoteAuthSession struct {
	SessionID         string           `json:"session_id"`
	SessionSecretHash string           `json:"session_secret_hash"`
	CreatedAt         time.Time        `json:"created_at"`
	LastSeenAt        time.Time        `json:"last_seen_at"`
	ExpiresAt         time.Time        `json:"expires_at"`
	RevokedAt         *time.Time       `json:"revoked_at,omitempty"`
	DeviceLabel       string           `json:"device_label,omitempty"`
	Origin            RemoteAuthOrigin `json:"origin,omitempty"`
}

type RemoteAuthAttempt struct {
	Fingerprint string    `json:"fingerprint"`
	CreatedAt   time.Time `json:"created_at"`
}

type RemoteAuthOrigin struct {
	RemoteAddr   string `json:"remote_addr,omitempty"`
	ForwardedFor string `json:"forwarded_for,omitempty"`
	UserAgent    string `json:"user_agent,omitempty"`
	Origin       string `json:"origin,omitempty"`
	Host         string `json:"host,omitempty"`
}

func NewRemoteAuthStore(workspace string) (*RemoteAuthStore, error) {
	root, err := ResolveWhipBaseDir()
	if err != nil {
		return nil, err
	}
	return NewRemoteAuthStoreWithRoot(root, workspace)
}

func NewRemoteAuthStoreWithRoot(whipRoot, workspace string) (*RemoteAuthStore, error) {
	normalized, err := normalizeRemoteAuthWorkspace(workspace)
	if err != nil {
		return nil, err
	}

	root, err := canonicalizeStorePath(whipRoot)
	if err != nil {
		return nil, fmt.Errorf("resolve whip root: %w", err)
	}
	if err := ensureStoreRoot(root, whipStoreKind); err != nil {
		return nil, fmt.Errorf("prepare WHIP_HOME: %w", err)
	}

	dir := filepath.Join(root, remoteAuthDirName)
	if err := ensurePrivateDir(dir); err != nil {
		return nil, fmt.Errorf("prepare remote auth dir: %w", err)
	}

	path := filepath.Join(dir, normalized+".json")
	return &RemoteAuthStore{
		Workspace: normalized,
		Path:      path,
		lockPath:  path + ".lock",
	}, nil
}

func (s *RemoteAuthStore) LoadState() (*RemoteAuthState, error) {
	var stateCopy *RemoteAuthState
	err := s.withLockedState(func(state *RemoteAuthState) (bool, error) {
		changed := pruneRemoteAuthState(state, time.Now().UTC())
		stateCopy = cloneRemoteAuthState(state)
		return changed, nil
	})
	return stateCopy, err
}

func (s *RemoteAuthStore) CreateChallenge(now time.Time, origin RemoteAuthOrigin, deviceLabel string) (*RemoteAuthChallenge, string, error) {
	var challenge *RemoteAuthChallenge
	var rawOTP string

	err := s.withLockedState(func(state *RemoteAuthState) (bool, error) {
		pruneRemoteAuthState(state, now)
		fingerprint := remoteAuthAttemptFingerprint(deviceLabel, origin)
		if countRecentRemoteAuthAttempts(state.Attempts, fingerprint, now) >= RemoteAuthAttemptLimit {
			return false, ErrRemoteAuthChallengeRateLimited
		}
		record, otp, err := newRemoteAuthChallenge(now, origin, deviceLabel)
		if err != nil {
			return false, err
		}
		state.PendingChallenge = record
		state.Attempts = append(state.Attempts, RemoteAuthAttempt{
			Fingerprint: fingerprint,
			CreatedAt:   now.UTC(),
		})
		state.UpdatedAt = now.UTC()
		challenge = cloneRemoteAuthChallenge(record)
		rawOTP = otp
		return true, nil
	})
	return challenge, rawOTP, err
}

func (s *RemoteAuthStore) ExchangeChallenge(now time.Time, challengeID, otp, deviceLabel string) (*RemoteAuthSession, string, error) {
	var session *RemoteAuthSession
	var rawSecret string

	err := s.withLockedState(func(state *RemoteAuthState) (bool, error) {
		challenge := state.PendingChallenge
		if challenge == nil {
			return pruneRemoteAuthState(state, now), ErrRemoteAuthNoChallenge
		}
		if challenge.ChallengeID != challengeID {
			return pruneRemoteAuthState(state, now), ErrRemoteAuthNoChallenge
		}
		if challenge.Used {
			return pruneRemoteAuthState(state, now), ErrRemoteAuthChallengeUsed
		}
		if challenge.Failed {
			return pruneRemoteAuthState(state, now), ErrRemoteAuthChallengeFailed
		}
		if !now.Before(challenge.ExpiresAt) {
			return pruneRemoteAuthState(state, now), ErrRemoteAuthChallengeExpired
		}
		if !constantTimeEqualHash(challenge.OTPHash, hashRemoteAuthValue(strings.TrimSpace(otp))) {
			failedAt := now.UTC()
			challenge.Failed = true
			challenge.FailedAt = &failedAt
			state.UpdatedAt = now.UTC()
			return true, ErrRemoteAuthInvalidOTP
		}

		usedAt := now.UTC()
		challenge.Used = true
		challenge.UsedAt = &usedAt

		record, secret, err := newRemoteAuthSession(now, challenge.Origin, chooseRemoteAuthDeviceLabel(deviceLabel, challenge.DeviceLabel, challenge.Origin))
		if err != nil {
			return false, err
		}
		state.Sessions = upsertRemoteAuthSession(state.Sessions, record)
		state.UpdatedAt = now.UTC()
		session = cloneRemoteAuthSession(record)
		rawSecret = secret
		return true, nil
	})
	return session, rawSecret, err
}

func (s *RemoteAuthStore) AuthenticateSession(now time.Time, sessionID, sessionSecret string) (*RemoteAuthSession, error) {
	var sessionCopy *RemoteAuthSession
	err := s.withLockedState(func(state *RemoteAuthState) (bool, error) {
		var authErr error
		for i := range state.Sessions {
			session := &state.Sessions[i]
			if session.SessionID != sessionID {
				continue
			}
			if session.RevokedAt != nil {
				authErr = ErrRemoteAuthSessionRevoked
				break
			}
			if !now.Before(session.ExpiresAt) {
				authErr = ErrRemoteAuthSessionExpired
				break
			}
			if !constantTimeEqualHash(session.SessionSecretHash, hashRemoteAuthValue(strings.TrimSpace(sessionSecret))) {
				authErr = ErrRemoteAuthSessionNotFound
				break
			}

			session.LastSeenAt = now.UTC()
			if session.ExpiresAt.Sub(now) < RemoteAuthSessionRefreshTTL {
				session.ExpiresAt = now.UTC().Add(RemoteAuthSessionTTL)
			}
			state.UpdatedAt = now.UTC()
			sessionCopy = cloneRemoteAuthSession(session)
			return true, nil
		}
		changed := pruneRemoteAuthState(state, now)
		if authErr != nil {
			return changed, authErr
		}
		return changed, ErrRemoteAuthSessionNotFound
	})
	return sessionCopy, err
}

func pruneRemoteAuthState(state *RemoteAuthState, now time.Time) bool {
	if state == nil {
		return false
	}

	changed := false
	if state.PendingChallenge != nil && shouldPruneRemoteAuthChallenge(state.PendingChallenge, now) {
		state.PendingChallenge = nil
		changed = true
	}

	if len(state.Sessions) > 0 {
		kept := state.Sessions[:0]
		for i := range state.Sessions {
			session := state.Sessions[i]
			if shouldPruneRemoteAuthSession(&session, now) {
				changed = true
				continue
			}
			kept = append(kept, session)
		}
		if len(kept) == 0 {
			state.Sessions = nil
		} else {
			state.Sessions = kept
		}
	}

	if len(state.Attempts) > 0 {
		kept := state.Attempts[:0]
		cutoff := now.Add(-RemoteAuthAttemptWindow)
		for i := range state.Attempts {
			attempt := state.Attempts[i]
			if attempt.CreatedAt.Before(cutoff) {
				changed = true
				continue
			}
			kept = append(kept, attempt)
		}
		if len(kept) == 0 {
			state.Attempts = nil
		} else {
			state.Attempts = kept
		}
	}

	if changed {
		state.UpdatedAt = now.UTC()
	}
	return changed
}

func shouldPruneRemoteAuthChallenge(challenge *RemoteAuthChallenge, now time.Time) bool {
	if challenge == nil {
		return false
	}
	return !now.Before(challenge.ExpiresAt)
}

func shouldPruneRemoteAuthSession(session *RemoteAuthSession, now time.Time) bool {
	if session == nil {
		return false
	}
	return session.RevokedAt != nil || !now.Before(session.ExpiresAt)
}

func countRecentRemoteAuthAttempts(attempts []RemoteAuthAttempt, fingerprint string, now time.Time) int {
	if fingerprint == "" {
		return 0
	}
	cutoff := now.Add(-RemoteAuthAttemptWindow)
	count := 0
	for i := range attempts {
		if attempts[i].Fingerprint != fingerprint {
			continue
		}
		if attempts[i].CreatedAt.Before(cutoff) {
			continue
		}
		count++
	}
	return count
}

func remoteAuthAttemptFingerprint(deviceLabel string, origin RemoteAuthOrigin) string {
	label := strings.ToLower(strings.TrimSpace(deviceLabel))
	if label == "" {
		label = strings.ToLower(strings.TrimSpace(origin.UserAgent))
	}
	if label == "" {
		label = "device"
	}

	source := strings.TrimSpace(firstRemoteAuthIP(origin))
	if source == "" {
		source = strings.ToLower(strings.TrimSpace(origin.Host))
	}
	return hashRemoteAuthValue(label + "|" + source)
}

func firstRemoteAuthIP(origin RemoteAuthOrigin) string {
	if forwarded := strings.TrimSpace(origin.ForwardedFor); forwarded != "" {
		first := strings.TrimSpace(strings.Split(forwarded, ",")[0])
		if first != "" {
			return first
		}
	}
	if remoteAddr := strings.TrimSpace(origin.RemoteAddr); remoteAddr != "" {
		host, _, err := net.SplitHostPort(remoteAddr)
		if err == nil {
			return host
		}
		return remoteAddr
	}
	return ""
}

func normalizeRemoteAuthWorkspace(workspace string) (string, error) {
	normalized := strings.ToLower(strings.TrimSpace(workspace))
	if normalized == "" {
		return defaultRemoteAuthWorkspace, nil
	}
	if normalized == defaultRemoteAuthWorkspace {
		return defaultRemoteAuthWorkspace, nil
	}
	if !remoteAuthWorkspacePattern.MatchString(normalized) {
		return "", fmt.Errorf("invalid workspace %q: use lowercase letters, numbers, dots, dashes, or underscores", workspace)
	}
	return normalized, nil
}

func newRemoteAuthChallenge(now time.Time, origin RemoteAuthOrigin, deviceLabel string) (*RemoteAuthChallenge, string, error) {
	challengeID, err := randomRemoteAuthHex(16)
	if err != nil {
		return nil, "", err
	}
	otp, err := randomRemoteAuthOTP()
	if err != nil {
		return nil, "", err
	}
	record := &RemoteAuthChallenge{
		ChallengeID: challengeID,
		OTPHash:     hashRemoteAuthValue(otp),
		CreatedAt:   now.UTC(),
		ExpiresAt:   now.UTC().Add(RemoteAuthChallengeTTL),
		Origin:      origin,
		DeviceLabel: chooseRemoteAuthDeviceLabel(deviceLabel, "", origin),
	}
	return record, otp, nil
}

func newRemoteAuthSession(now time.Time, origin RemoteAuthOrigin, deviceLabel string) (*RemoteAuthSession, string, error) {
	sessionID, err := randomRemoteAuthHex(16)
	if err != nil {
		return nil, "", err
	}
	sessionSecret, err := randomRemoteAuthHex(32)
	if err != nil {
		return nil, "", err
	}
	record := &RemoteAuthSession{
		SessionID:         sessionID,
		SessionSecretHash: hashRemoteAuthValue(sessionSecret),
		CreatedAt:         now.UTC(),
		LastSeenAt:        now.UTC(),
		ExpiresAt:         now.UTC().Add(RemoteAuthSessionTTL),
		DeviceLabel:       chooseRemoteAuthDeviceLabel(deviceLabel, "", origin),
		Origin:            origin,
	}
	return record, sessionSecret, nil
}

func chooseRemoteAuthDeviceLabel(preferred string, fallback string, origin RemoteAuthOrigin) string {
	label := strings.TrimSpace(preferred)
	if label == "" {
		label = strings.TrimSpace(fallback)
	}
	if label == "" {
		label = strings.TrimSpace(origin.UserAgent)
	}
	if label == "" {
		label = "device"
	}
	if len(label) > 120 {
		return label[:120]
	}
	return label
}

func upsertRemoteAuthSession(sessions []RemoteAuthSession, session *RemoteAuthSession) []RemoteAuthSession {
	for i := range sessions {
		if sessions[i].SessionID == session.SessionID {
			sessions[i] = *session
			return sessions
		}
	}
	return append(sessions, *session)
}

func hashRemoteAuthValue(raw string) string {
	sum := sha256.Sum256([]byte(raw))
	return hex.EncodeToString(sum[:])
}

func constantTimeEqualHash(left string, right string) bool {
	return subtle.ConstantTimeCompare([]byte(left), []byte(right)) == 1
}

func randomRemoteAuthHex(size int) (string, error) {
	buf := make([]byte, size)
	if _, err := rand.Read(buf); err != nil {
		return "", err
	}
	return hex.EncodeToString(buf), nil
}

func randomRemoteAuthOTP() (string, error) {
	n, err := rand.Int(rand.Reader, big.NewInt(1000000))
	if err != nil {
		return "", err
	}
	return fmt.Sprintf("%06d", n.Int64()), nil
}

func cloneRemoteAuthState(state *RemoteAuthState) *RemoteAuthState {
	if state == nil {
		return nil
	}
	clone := &RemoteAuthState{
		Workspace: state.Workspace,
		UpdatedAt: state.UpdatedAt,
	}
	if state.PendingChallenge != nil {
		clone.PendingChallenge = cloneRemoteAuthChallenge(state.PendingChallenge)
	}
	if len(state.Sessions) > 0 {
		clone.Sessions = make([]RemoteAuthSession, len(state.Sessions))
		for i := range state.Sessions {
			clone.Sessions[i] = *cloneRemoteAuthSession(&state.Sessions[i])
		}
	}
	if len(state.Attempts) > 0 {
		clone.Attempts = append([]RemoteAuthAttempt(nil), state.Attempts...)
	}
	return clone
}

func cloneRemoteAuthChallenge(challenge *RemoteAuthChallenge) *RemoteAuthChallenge {
	if challenge == nil {
		return nil
	}
	clone := *challenge
	if challenge.FailedAt != nil {
		failedAt := *challenge.FailedAt
		clone.FailedAt = &failedAt
	}
	if challenge.UsedAt != nil {
		usedAt := *challenge.UsedAt
		clone.UsedAt = &usedAt
	}
	return &clone
}

func cloneRemoteAuthSession(session *RemoteAuthSession) *RemoteAuthSession {
	if session == nil {
		return nil
	}
	clone := *session
	if session.RevokedAt != nil {
		revokedAt := *session.RevokedAt
		clone.RevokedAt = &revokedAt
	}
	return &clone
}

func (s *RemoteAuthStore) withLockedState(fn func(*RemoteAuthState) (bool, error)) error {
	if err := ensurePrivateDir(filepath.Dir(s.Path)); err != nil {
		return err
	}

	lockFile, err := os.OpenFile(s.lockPath, os.O_CREATE|os.O_RDWR, privateFilePerm)
	if err != nil {
		return err
	}
	defer lockFile.Close()

	if err := lockFile.Chmod(privateFilePerm); err != nil {
		return err
	}
	if err := syscall.Flock(int(lockFile.Fd()), syscall.LOCK_EX); err != nil {
		return err
	}
	defer syscall.Flock(int(lockFile.Fd()), syscall.LOCK_UN)

	state, err := s.loadLockedState()
	if err != nil {
		return err
	}

	persist, fnErr := fn(state)
	if persist {
		if err := s.writeLockedState(state); err != nil {
			return err
		}
	}
	return fnErr
}

func (s *RemoteAuthStore) loadLockedState() (*RemoteAuthState, error) {
	data, err := os.ReadFile(s.Path)
	if err != nil {
		if os.IsNotExist(err) {
			return &RemoteAuthState{Workspace: s.Workspace}, nil
		}
		return nil, err
	}

	var state RemoteAuthState
	if err := json.Unmarshal(data, &state); err != nil {
		return nil, fmt.Errorf("parse remote auth state: %w", err)
	}
	if state.Workspace == "" {
		state.Workspace = s.Workspace
	}
	return &state, nil
}

func (s *RemoteAuthStore) writeLockedState(state *RemoteAuthState) error {
	if state == nil {
		return fmt.Errorf("remote auth state is nil")
	}
	state.Workspace = s.Workspace
	encoded, err := json.MarshalIndent(state, "", "  ")
	if err != nil {
		return err
	}
	encoded = append(encoded, '\n')
	return atomicWriteFile(s.Path, encoded, privateFilePerm)
}
