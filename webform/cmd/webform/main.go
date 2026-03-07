package main

import (
	"fmt"
	"os"

	"github.com/bang9/ai-tools/shared/upgrade"
	"github.com/bang9/ai-tools/webform/internal/schema"
	"github.com/bang9/ai-tools/webform/internal/server"
)

var version = "dev"

func main() {
	if len(os.Args) > 1 {
		switch os.Args[1] {
		case "schema":
			fmt.Print(schema.Reference())
			return
		case "version", "--version":
			fmt.Println(version)
			return
		case "upgrade":
			if err := upgrade.Run(upgrade.Config{
				Repo:       "bang9/ai-tools",
				BinaryName: "webform",
				Version:    version,
			}); err != nil {
				fmt.Fprintf(os.Stderr, "error: %v\n", err)
				os.Exit(1)
			}
			return
		case "--help", "-h", "help":
			printUsage()
			return
		}
	}

	timeout := 300

	// Parse --timeout flag
	for i := 1; i < len(os.Args); i++ {
		if os.Args[i] == "--timeout" && i+1 < len(os.Args) {
			fmt.Sscanf(os.Args[i+1], "%d", &timeout)
		}
	}

	s, err := schema.ReadFromStdin()
	if err != nil {
		fmt.Fprintf(os.Stderr, "error: %v\n", err)
		os.Exit(1)
	}

	// Schema-level timeout override
	if s.Timeout > 0 && timeout == 300 {
		timeout = s.Timeout
	}

	result, err := server.Run(s, timeout)
	if err != nil {
		fmt.Fprintf(os.Stderr, "error: %v\n", err)
		os.Exit(1)
	}

	fmt.Println(result)
}

func printUsage() {
	fmt.Println(`webform - Dynamic web form for structured data collection

Usage:
  webform [--timeout N]    Read schema from stdin, open form in browser
  webform schema           Print schema reference for AI
  webform version          Print version
  webform upgrade          Upgrade to latest version

Options:
  --timeout N   Timeout in seconds (default: 300, overridden by schema "to" field)

Example:
  webform <<< '{"t":"Config","f":[["key","pw","API Key",{"r":1}]]}'`)
}

