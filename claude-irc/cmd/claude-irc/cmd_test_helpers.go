package main

import (
	"fmt"

	"github.com/bang9/ai-tools/claude-irc/internal/irc"
)

func noSessionDetect(pid int) (*irc.Store, string, error) {
	return nil, "", fmt.Errorf("no active session for pid %d", pid)
}
