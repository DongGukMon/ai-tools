package main

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"

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
			if err := upgrade(); err != nil {
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

func upgrade() error {
	repo := "bang9/ai-tools"

	fmt.Fprintln(os.Stderr, "Checking for updates...")
	out, err := exec.Command("curl", "-sfSL",
		fmt.Sprintf("https://api.github.com/repos/%s/releases/latest", repo)).Output()
	if err != nil {
		return fmt.Errorf("failed to check latest version: %w", err)
	}

	latestVersion := ""
	for _, line := range strings.Split(string(out), "\n") {
		line = strings.TrimSpace(line)
		if strings.Contains(line, `"tag_name"`) {
			parts := strings.Split(line, `"`)
			if len(parts) >= 4 {
				latestVersion = parts[3]
			}
			break
		}
	}
	if latestVersion == "" {
		return fmt.Errorf("failed to parse latest version from GitHub")
	}

	if version != "dev" && latestVersion == version {
		fmt.Fprintf(os.Stderr, "Already up to date (%s)\n", version)
		return nil
	}

	binaryName := fmt.Sprintf("webform-%s-%s", runtime.GOOS, runtime.GOARCH)
	downloadURL := fmt.Sprintf("https://github.com/%s/releases/download/%s/%s", repo, latestVersion, binaryName)

	binPath, err := os.Executable()
	if err != nil {
		binPath = filepath.Join(os.Getenv("HOME"), ".local", "bin", "webform")
	}
	if resolved, err := filepath.EvalSymlinks(binPath); err == nil {
		binPath = resolved
	}

	fmt.Fprintf(os.Stderr, "Downloading %s...\n", latestVersion)
	dlCmd := exec.Command("curl", "-fsSL", "-o", binPath, downloadURL)
	dlCmd.Stderr = os.Stderr
	if err := dlCmd.Run(); err != nil {
		return fmt.Errorf("download failed: %w", err)
	}

	if err := os.Chmod(binPath, 0755); err != nil {
		return fmt.Errorf("chmod failed: %w", err)
	}

	fmt.Fprintf(os.Stderr, "Updated to %s\n", latestVersion)
	return nil
}
