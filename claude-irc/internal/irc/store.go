package irc

import (
	"context"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"time"
)

const baseDir = ".claude-irc"

// Store manages the file-based storage for claude-irc.
type Store struct {
	BaseDir string // ~/.claude-irc/
	Name    string // current peer name (set after join)
}

// NewStore creates a Store at ~/.claude-irc/.
func NewStore() (*Store, error) {
	dir, err := ResolveStoreBaseDir()
	if err != nil {
		return nil, fmt.Errorf("failed to get store directory: %w", err)
	}
	if err := os.MkdirAll(dir, 0755); err != nil {
		return nil, fmt.Errorf("failed to create store directory: %w", err)
	}

	return &Store{BaseDir: dir}, nil
}

func ResolveStoreBaseDir() (string, error) {
	if override := strings.TrimSpace(os.Getenv("CLAUDE_IRC_HOME")); override != "" {
		return override, nil
	}
	home, err := os.UserHomeDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(home, baseDir), nil
}

// NewStoreWithBaseDir creates a Store with a custom base directory (used for testing).
func NewStoreWithBaseDir(dir string) (*Store, error) {
	if err := os.MkdirAll(dir, 0755); err != nil {
		return nil, fmt.Errorf("failed to create store directory: %w", err)
	}
	return &Store{BaseDir: dir}, nil
}

// Path helpers

func (s *Store) RegistryPath() string          { return filepath.Join(s.BaseDir, "registry.json") }
func (s *Store) LockPath() string              { return filepath.Join(s.BaseDir, "registry.lock") }
func (s *Store) SocketsDir() string            { return filepath.Join(s.BaseDir, "sockets") }
func (s *Store) SocketPath(name string) string { return filepath.Join(s.SocketsDir(), name+".sock") }
func (s *Store) PIDPath(name string) string    { return filepath.Join(s.SocketsDir(), name+".pid") }
func (s *Store) InboxDir(name string) string   { return filepath.Join(s.BaseDir, "inbox", name) }

// Session marker: allows check command to detect current session without running git.
// Markers are keyed by daemonPID (unique per peer) and store "name\nsessionPID".

func (s *Store) SessionMarkerPath(daemonPID int) string {
	return filepath.Join(s.BaseDir, fmt.Sprintf(".session_%d", daemonPID))
}

func (s *Store) WriteSessionMarker(name string, daemonPID int, sessionPID int) error {
	content := fmt.Sprintf("%s\n%d", name, sessionPID)
	return os.WriteFile(s.SessionMarkerPath(daemonPID), []byte(content), 0644)
}

func (s *Store) RemoveSessionMarker(daemonPID int) error {
	return os.Remove(s.SessionMarkerPath(daemonPID))
}

// parseSessionMarker parses marker content returning (name, sessionPID).
// Handles both new format "name\nsessionPID" and legacy format "name" (sessionPID=0).
func parseSessionMarker(data []byte) (name string, sessionPID int) {
	content := strings.TrimSpace(string(data))
	parts := strings.SplitN(content, "\n", 2)
	name = strings.TrimSpace(parts[0])
	if len(parts) >= 2 {
		sessionPID, _ = strconv.Atoi(strings.TrimSpace(parts[1]))
	}
	return
}

// sessionMarkerInfo holds parsed session marker data.
type sessionMarkerInfo struct {
	name       string
	daemonPID  int
	sessionPID int
}

// DetectSession finds a session marker matching the given PID or any ancestor PID.
// Markers are keyed by daemonPID and contain "name\nsessionPID". The function walks
// up the process tree and matches ancestor PIDs against the sessionPID stored in each
// marker. For legacy markers (no sessionPID), it falls back to matching the daemonPID
// (filename PID) against ancestors.
func DetectSession(pid int) (store *Store, name string, err error) {
	dir, err := ResolveStoreBaseDir()
	if err != nil {
		return nil, "", err
	}

	// Collect all session markers
	entries, err := os.ReadDir(dir)
	if err != nil {
		return nil, "", fmt.Errorf("no active session for pid %d", pid)
	}

	var markers []sessionMarkerInfo
	for _, e := range entries {
		if !strings.HasPrefix(e.Name(), ".session_") {
			continue
		}
		pidStr := strings.TrimPrefix(e.Name(), ".session_")
		daemonPID, err := strconv.Atoi(pidStr)
		if err != nil {
			continue
		}
		data, err := os.ReadFile(filepath.Join(dir, e.Name()))
		if err != nil {
			continue
		}
		peerName, sessionPID := parseSessionMarker(data)
		if peerName != "" {
			markers = append(markers, sessionMarkerInfo{
				name:       peerName,
				daemonPID:  daemonPID,
				sessionPID: sessionPID,
			})
		}
	}

	if len(markers) == 0 {
		return nil, "", fmt.Errorf("no active session for pid %d", pid)
	}

	// Build lookup maps: sessionPID → markers, daemonPID → marker (legacy fallback)
	sessionPIDMap := make(map[int][]sessionMarkerInfo)
	daemonPIDMap := make(map[int]sessionMarkerInfo)
	for _, m := range markers {
		if m.sessionPID > 0 {
			sessionPIDMap[m.sessionPID] = append(sessionPIDMap[m.sessionPID], m)
		}
		daemonPIDMap[m.daemonPID] = m
	}

	// Walk up the process tree checking against known session PIDs and daemon PIDs
	current := pid
	for i := 0; i < 10; i++ {
		// Check new format: match ancestor against sessionPIDs
		if infos, ok := sessionPIDMap[current]; ok {
			if len(infos) == 1 {
				return &Store{BaseDir: dir, Name: infos[0].name}, infos[0].name, nil
			}
			// Multiple peers share the same sessionPID; prefer the one with an alive daemon
			var alive []sessionMarkerInfo
			for _, info := range infos {
				if isProcessAlive(info.daemonPID) {
					alive = append(alive, info)
				}
			}
			if len(alive) == 1 {
				return &Store{BaseDir: dir, Name: alive[0].name}, alive[0].name, nil
			}
			// Can't disambiguate — return first alive (or first overall)
			pick := infos[0]
			if len(alive) > 0 {
				pick = alive[0]
			}
			return &Store{BaseDir: dir, Name: pick.name}, pick.name, nil
		}

		// Check legacy format: match ancestor against daemonPIDs (filename PIDs)
		if m, ok := daemonPIDMap[current]; ok {
			return &Store{BaseDir: dir, Name: m.name}, m.name, nil
		}

		parent := getParentPID(current)
		if parent <= 1 || parent == current {
			break
		}
		current = parent
	}

	return nil, "", fmt.Errorf("no active session for pid %d", pid)
}

// getParentPID returns the parent PID of the given process.
func getParentPID(pid int) int {
	ctx, cancel := context.WithTimeout(context.Background(), 500*time.Millisecond)
	defer cancel()
	out, err := exec.CommandContext(ctx, "ps", "-o", "ppid=", "-p", strconv.Itoa(pid)).Output()
	if err != nil {
		return 0
	}
	ppid, err := strconv.Atoi(strings.TrimSpace(string(out)))
	if err != nil {
		return 0
	}
	return ppid
}

// FindSessionPID walks up the process tree from the given PID to find the
// most appropriate PID to use as session identifier. It looks for a "claude"
// process in the ancestry (Claude Code), falling back to the given PID.
func FindSessionPID(startPID int) int {
	current := startPID
	for i := 0; i < 10; i++ {
		comm := getProcessComm(current)
		if comm == "claude" {
			return current
		}
		parent := getParentPID(current)
		if parent <= 1 || parent == current {
			break
		}
		current = parent
	}
	return startPID // fallback: use the given PID as-is
}

func getProcessComm(pid int) string {
	ctx, cancel := context.WithTimeout(context.Background(), 500*time.Millisecond)
	defer cancel()
	out, err := exec.CommandContext(ctx, "ps", "-o", "comm=", "-p", strconv.Itoa(pid)).Output()
	if err != nil {
		return ""
	}
	return strings.TrimSpace(string(out))
}
