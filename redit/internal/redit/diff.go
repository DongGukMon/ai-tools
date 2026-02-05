package redit

import (
	"fmt"
	"os"
	"os/exec"
)

func (s *Store) Diff(key string) (string, error) {
	dir := s.keyToDir(key)

	originPath := dir + "/" + originFile
	workingPath := dir + "/" + workingFile

	if _, err := os.Stat(originPath); os.IsNotExist(err) {
		return "", fmt.Errorf("key not found: %s", key)
	}

	// Use system diff command for unified diff format
	cmd := exec.Command("diff", "-u", originPath, workingPath)
	output, err := cmd.Output()

	// diff returns exit code 1 if files differ, which is not an error for us
	if err != nil {
		if exitErr, ok := err.(*exec.ExitError); ok {
			if exitErr.ExitCode() == 1 {
				// Files differ, output contains the diff
				return string(output), nil
			}
		}
		return "", fmt.Errorf("diff command failed: %w", err)
	}

	// Exit code 0 means files are identical
	return "", nil
}
