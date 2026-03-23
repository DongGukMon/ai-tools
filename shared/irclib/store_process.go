package irclib

import (
	"context"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"time"
)

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

// sessionBinaries lists process names that identify an AI coding session.
var sessionBinaries = map[string]bool{
	"claude": true,
	"codex":  true,
}

// commFunc is the function used to resolve a PID's command name.
// Override in tests to avoid real process lookups.
var commFunc = getProcessComm

// parentFunc is the function used to resolve a PID's parent.
// Override in tests to avoid real process lookups.
var parentFunc = getParentPID

// FindSessionPID walks up the process tree from the given PID to find the
// most appropriate PID to use as session identifier. It looks for a known
// session binary (claude, codex) in the ancestry, falling back to the given PID.
func FindSessionPID(startPID int) int {
	current := startPID
	for i := 0; i < 10; i++ {
		comm := filepath.Base(commFunc(current))
		if sessionBinaries[comm] {
			return current
		}
		parent := parentFunc(current)
		if parent <= 1 || parent == current {
			break
		}
		current = parent
	}
	return startPID
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
