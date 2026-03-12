package main

import (
	"fmt"
	"os"
	"strconv"
	"strings"

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
	case "version", "--version", "-v":
		fmt.Printf("rewind %s\n", version)
		return
	case "cleanup":
		if len(os.Args) != 2 {
			fmt.Fprintln(os.Stderr, "Error: cleanup does not accept additional arguments")
			os.Exit(1)
		}
		removed, err := server.CleanupStaleViewerDirs()
		if err != nil {
			fmt.Fprintf(os.Stderr, "Error: %v\n", err)
			os.Exit(1)
		}
		fmt.Fprintf(os.Stderr, "Removed %d stale viewer director", removed)
		if removed == 1 {
			fmt.Fprintln(os.Stderr, "y")
		} else {
			fmt.Fprintln(os.Stderr, "ies")
		}
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

	backend := os.Args[1]
	sessionID := ""
	sessionPath := ""
	port := 0
	openBrowser := true

	// Parse optional flags
	for i := 2; i < len(os.Args); i++ {
		switch os.Args[i] {
		case "--port":
			if i+1 >= len(os.Args) {
				fmt.Fprintln(os.Stderr, "Error: --port requires a value")
				os.Exit(1)
			}
			p, err := strconv.Atoi(os.Args[i+1])
			if err != nil || p < 0 || p > 65535 {
				fmt.Fprintf(os.Stderr, "Error: invalid port: %s\n", os.Args[i+1])
				os.Exit(1)
			}
			port = p
			i++
		case "--path":
			if i+1 >= len(os.Args) {
				fmt.Fprintln(os.Stderr, "Error: --path requires a value")
				os.Exit(1)
			}
			sessionPath = os.Args[i+1]
			i++
		case "--no-open":
			openBrowser = false
		case "--help", "-h":
			printUsage()
			return
		default:
			if strings.HasPrefix(os.Args[i], "--") {
				fmt.Fprintf(os.Stderr, "Error: unknown option: %s\n", os.Args[i])
				os.Exit(1)
			}
			if sessionID != "" {
				fmt.Fprintf(os.Stderr, "Error: unexpected extra argument: %s\n", os.Args[i])
				os.Exit(1)
			}
			sessionID = os.Args[i]
		}
	}

	if backend != "claude" && backend != "codex" {
		fmt.Fprintf(os.Stderr, "Error: backend must be 'claude' or 'codex', got '%s'\n", backend)
		os.Exit(1)
	}
	if sessionID == "" && sessionPath == "" {
		printUsage()
		os.Exit(1)
	}
	if sessionID != "" && sessionPath != "" {
		fmt.Fprintln(os.Stderr, "Error: provide either a session id or --path, not both")
		os.Exit(1)
	}

	// Find session file
	var path string
	var err error
	if sessionPath != "" {
		path, err = parser.ResolveSessionPath(sessionPath)
	} else {
		switch backend {
		case "claude":
			path, err = parser.FindClaudeSession(sessionID)
		case "codex":
			path, err = parser.FindCodexSession(sessionID)
		}
	}
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error: %v\n", err)
		os.Exit(1)
	}

	fmt.Fprintln(os.Stderr, "Session file resolved")

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
	if err := server.Run(session, server.Options{
		Port:        port,
		OpenBrowser: openBrowser,
	}); err != nil {
		fmt.Fprintf(os.Stderr, "Error: %v\n", err)
		os.Exit(1)
	}
}

func printUsage() {
	fmt.Fprintf(os.Stderr, `rewind %s — session transcript timeline viewer

Usage:
  rewind <backend> <session-id> [--no-open]
  rewind <backend> --path <session-file.jsonl> [--no-open]
  rewind cleanup
  rewind version
  rewind upgrade

Backends:
  claude    Claude Code session (~/.claude/projects/*/<id>.jsonl)
  codex     Codex session (~/.codex/sessions/YYYY/MM/DD/*-<id>.jsonl)

Options:
  --port    Deprecated. Ignored in static viewer mode
  --path    Use an explicit session file instead of auto-discovery
  --no-open Export the viewer without opening a browser and print the viewer index.html path
  -v        Print the current version

Notes:
  Exports a self-contained HTML viewer to ~/.rewind/viewers
  Viewer directories older than 30 minutes are deleted on the next run
  Use 'rewind cleanup' to remove stale viewer directories on demand

Examples:
  rewind claude abc12345-1234-1234-1234-1234567890ab
  rewind codex --path ~/.codex/sessions/2026/03/11/run-abc12345.jsonl --no-open
  rewind cleanup
`, version)
}
