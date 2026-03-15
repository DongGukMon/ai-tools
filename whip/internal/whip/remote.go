package whip

import (
	"fmt"
	"net/http"
	"strings"
)

const MasterSessionName = DefaultGlobalMasterIRCName

var spawnMasterTmuxSession = SpawnTmuxSession

const (
	RemoteAuthModeToken  = "token"
	RemoteAuthModeDevice = "device"
)

func NormalizeRemoteAuthMode(raw string) string {
	switch strings.ToLower(strings.TrimSpace(raw)) {
	case RemoteAuthModeDevice:
		return RemoteAuthModeDevice
	case RemoteAuthModeToken:
		return RemoteAuthModeToken
	default:
		return RemoteAuthModeDevice
	}
}

func ValidateRemoteAuthMode(raw string) error {
	switch strings.ToLower(strings.TrimSpace(raw)) {
	case "", RemoteAuthModeToken, RemoteAuthModeDevice:
		return nil
	default:
		return fmt.Errorf("invalid remote auth mode %q (expected %q or %q)", raw, RemoteAuthModeToken, RemoteAuthModeDevice)
	}
}

// RemoteConfig holds settings for the whip remote command.
type RemoteConfig struct {
	Backend    string
	Difficulty string
	Tunnel     string
	Port       int
	BindHost   string
	CWD        string
	Workspace  string
	AuthMode   string

	testHandlerWrapper func(http.Handler) http.Handler
}

// ServeResult holds the remote access URLs for a running whip remote session.
type ServeResult struct {
	ConnectURL string
	ShortURL   string
}
