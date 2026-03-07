package main

import (
	"fmt"
	"os"
	"text/tabwriter"

	"github.com/bang9/ai-tools/redit/internal/redit"
)

var version = "dev"

const usage = `redit - Remote Edit Layer for AI-assisted document editing

Usage:
  redit init <key>       Read content from stdin, create origin + working copy, return working path
  redit get <key>        Return working file path
  redit read <key>       Output working file content to stdout
  redit diff <key>       Show unified diff between origin and working
  redit status <key>     Show dirty/clean status
  redit reset <key>      Reset working file to origin
  redit drop <key>       Remove all files for key
  redit list             List all managed keys with status

Examples:
  # Initialize from MCP content
  echo "$content" | redit init "confluence:12345"

  # Get path for editing
  redit get "confluence:12345"

  # Check if modified
  redit status "confluence:12345"

  # View changes
  redit diff "confluence:12345"

  # Read final content for commit
  redit read "confluence:12345"

  # Cleanup
  redit drop "confluence:12345"
`

func main() {
	if len(os.Args) < 2 {
		fmt.Print(usage)
		os.Exit(1)
	}

	store, err := redit.NewStore()
	if err != nil {
		fmt.Fprintf(os.Stderr, "error: %v\n", err)
		os.Exit(1)
	}

	cmd := os.Args[1]

	switch cmd {
	case "init":
		if len(os.Args) < 3 {
			fmt.Fprintln(os.Stderr, "error: init requires <key>")
			os.Exit(1)
		}
		key := os.Args[2]
		path, err := store.Init(key, os.Stdin)
		if err != nil {
			fmt.Fprintf(os.Stderr, "error: %v\n", err)
			os.Exit(1)
		}
		fmt.Println(path)

	case "get":
		if len(os.Args) < 3 {
			fmt.Fprintln(os.Stderr, "error: get requires <key>")
			os.Exit(1)
		}
		key := os.Args[2]
		path, err := store.Get(key)
		if err != nil {
			fmt.Fprintf(os.Stderr, "error: %v\n", err)
			os.Exit(1)
		}
		fmt.Println(path)

	case "read":
		if len(os.Args) < 3 {
			fmt.Fprintln(os.Stderr, "error: read requires <key>")
			os.Exit(1)
		}
		key := os.Args[2]
		content, err := store.Read(key)
		if err != nil {
			fmt.Fprintf(os.Stderr, "error: %v\n", err)
			os.Exit(1)
		}
		os.Stdout.Write(content)

	case "diff":
		if len(os.Args) < 3 {
			fmt.Fprintln(os.Stderr, "error: diff requires <key>")
			os.Exit(1)
		}
		key := os.Args[2]
		diff, err := store.Diff(key)
		if err != nil {
			fmt.Fprintf(os.Stderr, "error: %v\n", err)
			os.Exit(1)
		}
		if diff == "" {
			fmt.Println("no changes")
		} else {
			fmt.Print(diff)
		}

	case "status":
		if len(os.Args) < 3 {
			fmt.Fprintln(os.Stderr, "error: status requires <key>")
			os.Exit(1)
		}
		key := os.Args[2]
		status, err := store.Status(key)
		if err != nil {
			fmt.Fprintf(os.Stderr, "error: %v\n", err)
			os.Exit(1)
		}
		fmt.Println(status)

	case "reset":
		if len(os.Args) < 3 {
			fmt.Fprintln(os.Stderr, "error: reset requires <key>")
			os.Exit(1)
		}
		key := os.Args[2]
		if err := store.Reset(key); err != nil {
			fmt.Fprintf(os.Stderr, "error: %v\n", err)
			os.Exit(1)
		}
		fmt.Println("reset complete")

	case "drop":
		if len(os.Args) < 3 {
			fmt.Fprintln(os.Stderr, "error: drop requires <key>")
			os.Exit(1)
		}
		key := os.Args[2]
		if err := store.Drop(key); err != nil {
			fmt.Fprintf(os.Stderr, "error: %v\n", err)
			os.Exit(1)
		}
		fmt.Println("dropped")

	case "list":
		items, err := store.List()
		if err != nil {
			fmt.Fprintf(os.Stderr, "error: %v\n", err)
			os.Exit(1)
		}
		if len(items) == 0 {
			fmt.Println("no items")
			return
		}
		w := tabwriter.NewWriter(os.Stdout, 0, 0, 2, ' ', 0)
		fmt.Fprintln(w, "KEY\tSTATUS\tPATH")
		for _, item := range items {
			fmt.Fprintf(w, "%s\t%s\t%s\n", item.Key, item.Status, item.Path)
		}
		w.Flush()

	case "version", "--version":
		fmt.Printf("redit version %s\n", version)

	case "help", "-h", "--help":
		fmt.Print(usage)

	default:
		fmt.Fprintf(os.Stderr, "unknown command: %s\n", cmd)
		fmt.Print(usage)
		os.Exit(1)
	}
}
