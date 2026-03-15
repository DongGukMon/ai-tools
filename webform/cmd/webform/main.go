package main

import (
	"fmt"
	"io"
	"os"
	"strconv"

	"github.com/bang9/ai-tools/shared/upgrade"
	"github.com/bang9/ai-tools/webform/internal/schema"
	"github.com/bang9/ai-tools/webform/internal/server"
	"github.com/bang9/ai-tools/webform/internal/viewer"
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
		case "view":
			runView(os.Args[2:])
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
			n, err := strconv.Atoi(os.Args[i+1])
			if err != nil || n <= 0 {
				fmt.Fprintf(os.Stderr, "error: invalid --timeout value: %s\n", os.Args[i+1])
				os.Exit(1)
			}
			timeout = n
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

func runView(args []string) {
	format := ""
	title := "View"
	timeout := 300

	for i := 0; i < len(args); i++ {
		switch args[i] {
		case "--format":
			if i+1 < len(args) {
				i++
				format = args[i]
			}
		case "--title":
			if i+1 < len(args) {
				i++
				title = args[i]
			}
		case "--timeout":
			if i+1 < len(args) {
				i++
				n, err := strconv.Atoi(args[i])
				if err != nil || n <= 0 {
					fmt.Fprintf(os.Stderr, "error: invalid --timeout value: %s\n", args[i])
					os.Exit(1)
				}
				timeout = n
			}
		}
	}

	data, err := io.ReadAll(os.Stdin)
	if err != nil {
		fmt.Fprintf(os.Stderr, "error: %v\n", err)
		os.Exit(1)
	}
	content := string(data)
	if content == "" {
		fmt.Fprintf(os.Stderr, "error: no content on stdin\n")
		os.Exit(1)
	}

	htmlBody := viewer.Render(content, format)
	s, err := schema.NewViewSchema(title, htmlBody)
	if err != nil {
		fmt.Fprintf(os.Stderr, "error: %v\n", err)
		os.Exit(1)
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
  webform view [opts]      Read content from stdin, open read-only viewer
  webform schema           Print schema reference for AI
  webform version          Print version
  webform upgrade          Upgrade to latest version

Options:
  --timeout N   Timeout in seconds (default: 300, overridden by schema "to" field)

View options:
  --format F    Force format: md, json, text, html (default: auto-detect)
  --title T     Window title (default: "View")
  --timeout N   Timeout in seconds (default: 300)

Example:
  webform <<'EOF'
  form "Config"
  key pw "API Key" req
  env sel "Environment" req o=[dev,prod]
  EOF

  echo "# Hello" | webform view
  echo '{"a":1}' | webform view --format json

Schema reference:
  webform schema`)
}
