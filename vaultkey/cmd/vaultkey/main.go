package main

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"

	"github.com/bang9/ai-tools/vaultkey/internal/vaultkey"
	"github.com/spf13/cobra"
)

var (
	passwordFlag string
	ciFlag       bool

	// Set via -ldflags at build time
	version = "dev"
)

func main() {
	root := &cobra.Command{
		Use:     "vaultkey",
		Short:   "Encrypted secrets manager backed by a private Git repo",
		Version: version,
	}

	root.PersistentFlags().StringVar(&passwordFlag, "password", "", "vault password (or use VAULTKEY_PASSWORD env)")
	root.PersistentFlags().BoolVar(&ciFlag, "ci", false, "CI mode: skip interactive prompts")

	root.AddCommand(initCmd(), setCmd(), getCmd(), listCmd(), deleteCmd(), pushCmd(), pullCmd(), upgradeCmd())

	if err := root.Execute(); err != nil {
		os.Exit(1)
	}
}

func initCmd() *cobra.Command {
	return &cobra.Command{
		Use:   "init <git-repo-url>",
		Short: "Clone repo and create a new vault",
		Args:  cobra.ExactArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			repoURL := args[0]

			var pw string
			var err error
			if ciFlag {
				pw, err = vaultkey.GetPassword(passwordFlag)
			} else {
				pw, err = vaultkey.GetPasswordWithConfirm(passwordFlag)
			}
			if err != nil {
				return err
			}

			repoPath := filepath.Join(vaultkey.ConfigDir(), "repo")

			if _, err := os.Stat(repoPath); err == nil {
				return fmt.Errorf("repo already exists at %s (delete it first to reinit)", repoPath)
			}

			fmt.Fprintf(os.Stderr, "Cloning %s...\n", repoURL)
			if err := vaultkey.GitClone(repoURL, repoPath); err != nil {
				return err
			}

			vaultPath := filepath.Join(repoPath, "vault.json")
			if _, err := os.Stat(vaultPath); err == nil {
				// vault.json already exists in repo — just save config
				fmt.Fprintln(os.Stderr, "Found existing vault.json in repo.")
			} else {
				// Create new vault
				if _, err := vaultkey.CreateVault(repoPath, pw); err != nil {
					return err
				}
				fmt.Fprintln(os.Stderr, "Created new vault.")
			}

			if err := vaultkey.SaveConfig(&vaultkey.Config{RepoPath: repoPath}); err != nil {
				return err
			}

			fmt.Fprintln(os.Stderr, "Initialized successfully.")
			return nil
		},
	}
}

func setCmd() *cobra.Command {
	return &cobra.Command{
		Use:   "set <scope> <key> <value>",
		Short: "Store an encrypted secret",
		Args:  cobra.ExactArgs(3),
		RunE: func(cmd *cobra.Command, args []string) error {
			scope, key, value := args[0], args[1], args[2]

			cfg, err := vaultkey.LoadConfig()
			if err != nil {
				return err
			}

			pw, err := vaultkey.GetPassword(passwordFlag)
			if err != nil {
				return err
			}

			// Pull latest before mutation
			_ = vaultkey.GitPull(cfg.RepoPath)

			v, err := vaultkey.LoadVault(cfg.RepoPath, pw)
			if err != nil {
				return err
			}

			if err := v.Set(scope, key, value); err != nil {
				return err
			}

			fmt.Fprintf(os.Stderr, "Set %s/%s\n", scope, key)

			if err := vaultkey.GitSync(cfg.RepoPath); err != nil {
				return fmt.Errorf("sync failed: %w", err)
			}
			fmt.Fprintln(os.Stderr, "Synced.")
			return nil
		},
	}
}

func getCmd() *cobra.Command {
	return &cobra.Command{
		Use:   "get <scope> <key>",
		Short: "Retrieve and decrypt a secret",
		Args:  cobra.ExactArgs(2),
		RunE: func(cmd *cobra.Command, args []string) error {
			scope, key := args[0], args[1]

			v, err := openVault()
			if err != nil {
				return err
			}

			value, err := v.Get(scope, key)
			if err != nil {
				return err
			}

			fmt.Print(value)
			return nil
		},
	}
}

func listCmd() *cobra.Command {
	return &cobra.Command{
		Use:   "list [scope-prefix]",
		Short: "List scopes and keys (values are not shown)",
		Args:  cobra.MaximumNArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			cfg, err := vaultkey.LoadConfig()
			if err != nil {
				return err
			}

			pw, err := vaultkey.GetPassword(passwordFlag)
			if err != nil {
				return err
			}

			v, err := vaultkey.LoadVault(cfg.RepoPath, pw)
			if err != nil {
				return err
			}

			prefix := ""
			if len(args) > 0 {
				prefix = args[0]
			}

			entries := v.List(prefix)
			if len(entries) == 0 {
				fmt.Fprintln(os.Stderr, "No entries found.")
				return nil
			}

			for _, e := range entries {
				fmt.Println(e)
			}
			return nil
		},
	}
}

func deleteCmd() *cobra.Command {
	return &cobra.Command{
		Use:   "delete <scope> <key>",
		Short: "Delete a secret",
		Args:  cobra.ExactArgs(2),
		RunE: func(cmd *cobra.Command, args []string) error {
			scope, key := args[0], args[1]

			cfg, err := vaultkey.LoadConfig()
			if err != nil {
				return err
			}

			pw, err := vaultkey.GetPassword(passwordFlag)
			if err != nil {
				return err
			}

			// Pull latest before mutation
			_ = vaultkey.GitPull(cfg.RepoPath)

			v, err := vaultkey.LoadVault(cfg.RepoPath, pw)
			if err != nil {
				return err
			}

			if err := v.Delete(scope, key); err != nil {
				return err
			}

			fmt.Fprintf(os.Stderr, "Deleted %s/%s\n", scope, key)

			if err := vaultkey.GitSync(cfg.RepoPath); err != nil {
				return fmt.Errorf("sync failed: %w", err)
			}
			fmt.Fprintln(os.Stderr, "Synced.")
			return nil
		},
	}
}

func pushCmd() *cobra.Command {
	return &cobra.Command{
		Use:   "push",
		Short: "Commit and push vault changes to remote",
		Args:  cobra.NoArgs,
		RunE: func(cmd *cobra.Command, args []string) error {
			cfg, err := vaultkey.LoadConfig()
			if err != nil {
				return err
			}

			if err := vaultkey.GitPush(cfg.RepoPath); err != nil {
				return err
			}

			fmt.Fprintln(os.Stderr, "Pushed successfully.")
			return nil
		},
	}
}

func pullCmd() *cobra.Command {
	return &cobra.Command{
		Use:   "pull",
		Short: "Pull latest vault changes from remote",
		Args:  cobra.NoArgs,
		RunE: func(cmd *cobra.Command, args []string) error {
			cfg, err := vaultkey.LoadConfig()
			if err != nil {
				return err
			}

			if err := vaultkey.GitPull(cfg.RepoPath); err != nil {
				return err
			}

			fmt.Fprintln(os.Stderr, "Pulled successfully.")
			return nil
		},
	}
}

func upgradeCmd() *cobra.Command {
	return &cobra.Command{
		Use:   "upgrade",
		Short: "Upgrade vaultkey to the latest version",
		Args:  cobra.NoArgs,
		RunE: func(cmd *cobra.Command, args []string) error {
			repo := "bang9/ai-tools"

			// Fetch latest version from GitHub
			fmt.Fprintln(os.Stderr, "Checking for updates...")
			out, err := exec.Command("curl", "-sfSL",
				fmt.Sprintf("https://api.github.com/repos/%s/releases/latest", repo)).Output()
			if err != nil {
				return fmt.Errorf("failed to check latest version: %w", err)
			}

			// Parse tag_name from JSON (simple string search to avoid adding dependencies)
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

			osName := runtime.GOOS
			arch := runtime.GOARCH

			binaryName := fmt.Sprintf("vaultkey-%s-%s", osName, arch)
			if osName == "windows" {
				binaryName += ".exe"
			}

			downloadURL := fmt.Sprintf("https://github.com/%s/releases/download/%s/%s", repo, latestVersion, binaryName)

			// Find current binary path
			binPath, err := os.Executable()
			if err != nil {
				binPath = filepath.Join(os.Getenv("HOME"), ".local", "bin", "vaultkey")
			}
			// Resolve symlinks
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
		},
	}
}

func openVault() (*vaultkey.Vault, error) {
	cfg, err := vaultkey.LoadConfig()
	if err != nil {
		return nil, err
	}

	pw, err := vaultkey.GetPassword(passwordFlag)
	if err != nil {
		return nil, err
	}

	return vaultkey.LoadVault(cfg.RepoPath, pw)
}
