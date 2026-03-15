package agentbus

import (
	"fmt"
	"os"
	"path/filepath"
	"strconv"
	"strings"
)

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

	sessionPIDMap := make(map[int][]sessionMarkerInfo)
	daemonPIDMap := make(map[int]sessionMarkerInfo)
	for _, m := range markers {
		if m.sessionPID > 0 {
			sessionPIDMap[m.sessionPID] = append(sessionPIDMap[m.sessionPID], m)
		}
		daemonPIDMap[m.daemonPID] = m
	}

	current := pid
	for i := 0; i < 10; i++ {
		if infos, ok := sessionPIDMap[current]; ok {
			if len(infos) == 1 {
				return &Store{BaseDir: dir, Name: infos[0].name}, infos[0].name, nil
			}
			var alive []sessionMarkerInfo
			for _, info := range infos {
				if isProcessAlive(info.daemonPID) {
					alive = append(alive, info)
				}
			}
			if len(alive) == 1 {
				return &Store{BaseDir: dir, Name: alive[0].name}, alive[0].name, nil
			}
			pick := infos[0]
			if len(alive) > 0 {
				pick = alive[0]
			}
			return &Store{BaseDir: dir, Name: pick.name}, pick.name, nil
		}

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
