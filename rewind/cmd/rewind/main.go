package main

import (
	"fmt"
	"os"
	"strconv"

	"github.com/bang9/ai-tools/rewind/internal/parser"
	"github.com/bang9/ai-tools/rewind/internal/server"
	"github.com/bang9/ai-tools/shared/upgrade"
)

var version = "dev"

func main() {
	if len(os.Args) < 2 {
		printUsage()
		os.Exit(1)
	}

	switch os.Args[1] {
	case "version", "--version":
		fmt.Printf("rewind %s\n", version)
		return
	case "upgrade":
		if err := upgrade.Run(upgrade.Config{
			Repo:       "bang9/ai-tools",
			BinaryName: "rewind",
			Version:    version,
		}); err != nil {
			fmt.Fprintf(os.Stderr, "Error: %v\n", err)
			os.Exit(1)
		}
		return
	case "--help", "-h":
		printUsage()
		return
	}

	if len(os.Args) < 3 {
		printUsage()
		os.Exit(1)
	}

	backend := os.Args[1]
	sessionID := os.Args[2]
	port := 0

	// Parse optional flags
	for i := 3; i < len(os.Args); i++ {
		if os.Args[i] == "--port" && i+1 < len(os.Args) {
			p, err := strconv.Atoi(os.Args[i+1])
			if err != nil {
				fmt.Fprintf(os.Stderr, "Error: invalid port: %s\n", os.Args[i+1])
				os.Exit(1)
			}
			port = p
			i++
		}
	}

	if backend != "claude" && backend != "codex" {
		fmt.Fprintf(os.Stderr, "Error: backend must be 'claude' or 'codex', got '%s'\n", backend)
		os.Exit(1)
	}

	// Find session file
	var path string
	var err error
	switch backend {
	case "claude":
		path, err = parser.FindClaudeSession(sessionID)
	case "codex":
		path, err = parser.FindCodexSession(sessionID)
	}
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error: %v\n", err)
		os.Exit(1)
	}

	fmt.Fprintf(os.Stderr, "Found session: %s\n", path)

	// Parse session
	var session *parser.Session
	switch backend {
	case "claude":
		session, err = parser.ParseClaude(path)
	case "codex":
		session, err = parser.ParseCodex(path)
	}
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error: %v\n", err)
		os.Exit(1)
	}

	fmt.Fprintf(os.Stderr, "Parsed %d events\n", len(session.Events))

	// Start server
	if err := server.Run(session, port); err != nil {
		fmt.Fprintf(os.Stderr, "Error: %v\n", err)
		os.Exit(1)
	}
}

func printUsage() {
	fmt.Fprintf(os.Stderr, `rewind %s — session transcript timeline viewer

Usage:
  rewind <backend> <session-id> [--port <port>]
  rewind version
  rewind upgrade

Backends:
  claude    Claude Code session (~/.claude/projects/*/<id>.jsonl)
  codex     Codex session (~/.codex/sessions/**/*-<id>.jsonl)

Options:
  --port    Port to listen on (default: random)

Examples:
  rewind claude abc12345-1234-1234-1234-1234567890ab
  rewind codex abc12345-1234-1234-1234-1234567890ab --port 8080
`, version)
}
