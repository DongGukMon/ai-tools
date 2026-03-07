package upgrade

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
)

// Config holds the upgrade configuration for a tool.
type Config struct {
	Repo           string   // GitHub repo (e.g., "bang9/ai-tools")
	BinaryName     string   // Tool binary name (e.g., "claude-irc")
	Version        string   // Current version (set via -ldflags)
	CompanionTools []string // Additional tools to upgrade alongside self
}

// GetLatestVersion fetches the latest release tag from the GitHub API.
func GetLatestVersion(repo string) (string, error) {
	out, err := exec.Command("curl", "-sfSL",
		fmt.Sprintf("https://api.github.com/repos/%s/releases/latest", repo)).Output()
	if err != nil {
		return "", fmt.Errorf("failed to check latest version: %w", err)
	}

	for _, line := range strings.Split(string(out), "\n") {
		line = strings.TrimSpace(line)
		if strings.Contains(line, `"tag_name"`) {
			parts := strings.Split(line, `"`)
			if len(parts) >= 4 {
				return parts[3], nil
			}
			break
		}
	}

	return "", fmt.Errorf("failed to parse latest version from GitHub")
}

// DownloadBinary downloads a release binary to destPath using the safe download
// pattern: download to tmp file, remove old binary, then move new binary into place.
func DownloadBinary(repo, version, binaryName, destPath string) error {
	platformBinary := fmt.Sprintf("%s-%s-%s", binaryName, runtime.GOOS, runtime.GOARCH)
	downloadURL := fmt.Sprintf("https://github.com/%s/releases/download/%s/%s",
		repo, version, platformBinary)

	tmpPath := destPath + ".tmp"

	// Download to temporary file
	dlCmd := exec.Command("curl", "-fsSL", "-o", tmpPath, downloadURL)
	dlCmd.Stderr = os.Stderr
	if err := dlCmd.Run(); err != nil {
		os.Remove(tmpPath)
		return fmt.Errorf("download failed for %s: %w", binaryName, err)
	}

	if err := os.Chmod(tmpPath, 0755); err != nil {
		os.Remove(tmpPath)
		return fmt.Errorf("chmod failed for %s: %w", binaryName, err)
	}

	// Remove old binary
	os.Remove(destPath)

	// Move new binary into place
	if err := os.Rename(tmpPath, destPath); err != nil {
		os.Remove(tmpPath)
		return fmt.Errorf("failed to install %s: %w", binaryName, err)
	}

	return nil
}

// Run performs the full upgrade flow: check version, download self, download companions.
func Run(cfg Config) error {
	fmt.Fprintln(os.Stderr, "Checking for updates...")

	latestVersion, err := GetLatestVersion(cfg.Repo)
	if err != nil {
		return err
	}

	if cfg.Version != "dev" && latestVersion == cfg.Version {
		fmt.Fprintf(os.Stderr, "Already up to date (%s)\n", cfg.Version)
		return nil
	}

	// Resolve current binary path
	binPath, err := os.Executable()
	if err != nil {
		binPath = filepath.Join(os.Getenv("HOME"), ".local", "bin", cfg.BinaryName)
	}
	if resolved, err := filepath.EvalSymlinks(binPath); err == nil {
		binPath = resolved
	}

	installDir := filepath.Dir(binPath)

	// Build list: self first, then companions
	tools := []string{cfg.BinaryName}
	tools = append(tools, cfg.CompanionTools...)

	for _, tool := range tools {
		destPath := filepath.Join(installDir, tool)
		fmt.Fprintf(os.Stderr, "Downloading %s %s...\n", tool, latestVersion)
		if err := DownloadBinary(cfg.Repo, latestVersion, tool, destPath); err != nil {
			fmt.Fprintf(os.Stderr, "Warning: %v\n", err)
			continue
		}
		fmt.Fprintf(os.Stderr, "  %s updated\n", tool)
	}

	fmt.Fprintf(os.Stderr, "Updated to %s\n", latestVersion)
	return nil
}
