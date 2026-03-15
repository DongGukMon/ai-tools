package main

import (
	"fmt"

	irc "github.com/bang9/ai-tools/shared/irclib"
)

func noSessionDetect(pid int) (*irc.Store, string, error) {
	return nil, "", fmt.Errorf("no active session for pid %d", pid)
}
