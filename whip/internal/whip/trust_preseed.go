package whip

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"syscall"
)

// preseedClaudeTrust ensures ~/.claude.json has hasTrustDialogAccepted=true
// for the given directory. Uses flock for concurrent safety.
func preseedClaudeTrust(dir string) error {
	home, err := os.UserHomeDir()
	if err != nil {
		return fmt.Errorf("resolve home: %w", err)
	}
	configPath := filepath.Join(home, ".claude.json")
	lockPath := configPath + ".lock"

	unlock, err := acquireLock(lockPath)
	if err != nil {
		return fmt.Errorf("acquire lock: %w", err)
	}
	defer unlock()

	data := make(map[string]any)
	if raw, err := os.ReadFile(configPath); err == nil {
		if err := json.Unmarshal(raw, &data); err != nil {
			return fmt.Errorf("parse %s: %w", configPath, err)
		}
	}

	projects, _ := data["projects"].(map[string]any)
	if projects == nil {
		projects = make(map[string]any)
		data["projects"] = projects
	}

	project, _ := projects[dir].(map[string]any)
	if project == nil {
		project = make(map[string]any)
		projects[dir] = project
	}

	if accepted, _ := project["hasTrustDialogAccepted"].(bool); accepted {
		return nil
	}

	project["hasTrustDialogAccepted"] = true

	out, err := json.MarshalIndent(data, "", "  ")
	if err != nil {
		return fmt.Errorf("marshal: %w", err)
	}
	return os.WriteFile(configPath, out, 0644)
}

// preseedCodexTrust ensures ~/.codex/config.toml has trust_level="trusted"
// for the given directory. Uses flock for concurrent safety.
func preseedCodexTrust(dir string) error {
	home, err := os.UserHomeDir()
	if err != nil {
		return fmt.Errorf("resolve home: %w", err)
	}
	configPath := filepath.Join(home, ".codex", "config.toml")
	lockPath := configPath + ".lock"

	if err := os.MkdirAll(filepath.Dir(configPath), 0755); err != nil {
		return fmt.Errorf("create config dir: %w", err)
	}

	unlock, err := acquireLock(lockPath)
	if err != nil {
		return fmt.Errorf("acquire lock: %w", err)
	}
	defer unlock()

	content := ""
	if raw, err := os.ReadFile(configPath); err == nil {
		content = string(raw)
	}

	sectionHeader := fmt.Sprintf(`[projects."%s"]`, dir)
	if strings.Contains(content, sectionHeader) {
		idx := strings.Index(content, sectionHeader)
		after := content[idx+len(sectionHeader):]

		// Extract current section body (up to next section or EOF)
		nextSection := strings.Index(after, "\n[")
		var sectionBody string
		if nextSection >= 0 {
			sectionBody = after[:nextSection]
		} else {
			sectionBody = after
		}

		if strings.Contains(sectionBody, "trust_level") {
			return nil
		}

		// Insert trust_level right after section header
		insertAt := idx + len(sectionHeader)
		content = content[:insertAt] + "\ntrust_level = \"trusted\"" + content[insertAt:]
	} else {
		// Append new section with clean separation
		if content != "" && !strings.HasSuffix(content, "\n") {
			content += "\n"
		}
		content += fmt.Sprintf("\n%s\ntrust_level = \"trusted\"\n", sectionHeader)
	}

	return os.WriteFile(configPath, []byte(content), 0644)
}

// acquireLock acquires an exclusive file lock and returns an unlock function.
func acquireLock(path string) (unlock func(), err error) {
	f, err := os.OpenFile(path, os.O_CREATE|os.O_RDWR, 0644)
	if err != nil {
		return nil, err
	}
	if err := syscall.Flock(int(f.Fd()), syscall.LOCK_EX); err != nil {
		f.Close()
		return nil, err
	}
	return func() {
		syscall.Flock(int(f.Fd()), syscall.LOCK_UN)
		f.Close()
	}, nil
}
