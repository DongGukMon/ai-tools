package vaultkey

import (
	"fmt"
	"os/exec"
	"strings"
)

func GitClone(repoURL, dest string) error {
	cmd := exec.Command("git", "clone", repoURL, dest)
	out, err := cmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf("git clone failed: %s", strings.TrimSpace(string(out)))
	}
	return nil
}

func GitPull(repoPath string) error {
	cmd := exec.Command("git", "-C", repoPath, "pull", "--rebase")
	out, err := cmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf("git pull failed: %s", strings.TrimSpace(string(out)))
	}
	return nil
}

func GitPush(repoPath string) error {
	// Stage vault.json
	add := exec.Command("git", "-C", repoPath, "add", vaultFileName)
	if out, err := add.CombinedOutput(); err != nil {
		return fmt.Errorf("git add failed: %s", strings.TrimSpace(string(out)))
	}

	// Check if there are staged changes
	diff := exec.Command("git", "-C", repoPath, "diff", "--cached", "--quiet")
	if err := diff.Run(); err == nil {
		return fmt.Errorf("nothing to push (no changes)")
	}

	// Commit
	commit := exec.Command("git", "-C", repoPath, "commit", "-m", "vault: update secrets")
	if out, err := commit.CombinedOutput(); err != nil {
		return fmt.Errorf("git commit failed: %s", strings.TrimSpace(string(out)))
	}

	// Push
	push := exec.Command("git", "-C", repoPath, "push")
	out, err := push.CombinedOutput()
	if err != nil {
		return fmt.Errorf("git push failed: %s", strings.TrimSpace(string(out)))
	}
	return nil
}
