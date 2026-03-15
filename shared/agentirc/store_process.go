package agentirc

import (
	"context"
	"os/exec"
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
