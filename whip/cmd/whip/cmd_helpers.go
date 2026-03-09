package main

import (
	"fmt"
	"io"
	"net/url"
	"os"
	"strings"
	"time"

	"github.com/bang9/ai-tools/whip/internal/whip"
)

func resolveMasterIRCName(cfg *whip.Config, workspace string, override string) string {
	if strings.TrimSpace(override) != "" {
		return strings.TrimSpace(override)
	}
	if whip.NormalizeWorkspaceName(workspace) != whip.GlobalWorkspaceName {
		return whip.WorkspaceMasterIRCName(workspace)
	}
	return whip.DefaultMasterIRCName(cfg)
}

func ptrTime(t time.Time) *time.Time {
	return &t
}

// resolveDescription reads description from --desc, --file, or stdin.
func resolveDescription(desc, file string) (string, error) {
	if desc != "" {
		return desc, nil
	}
	if file != "" {
		data, err := os.ReadFile(file)
		if err != nil {
			return "", fmt.Errorf("cannot read description file: %w", err)
		}
		return strings.TrimSpace(string(data)), nil
	}

	stat, _ := os.Stdin.Stat()
	if (stat.Mode() & os.ModeCharDevice) == 0 {
		data, err := io.ReadAll(os.Stdin)
		if err != nil {
			return "", fmt.Errorf("cannot read stdin: %w", err)
		}
		content := strings.TrimSpace(string(data))
		if content != "" {
			return content, nil
		}
	}

	return "", nil
}

func formatShellPID(task *whip.Task) string {
	if task == nil || task.ShellPID <= 0 {
		return ""
	}
	state := whip.TaskProcessState(task)
	if state == whip.ProcessStateNone {
		return ""
	}
	return fmt.Sprintf("%d (%s)", task.ShellPID, state)
}

func truncate(s string, max int) string {
	if len(s) <= max {
		return s
	}
	if max <= 3 {
		return s[:max]
	}
	return s[:max-2] + ".."
}

func timeAgo(t time.Time) string {
	d := time.Since(t)
	switch {
	case d < time.Minute:
		return "just now"
	case d < time.Hour:
		return fmt.Sprintf("%dm ago", int(d.Minutes()))
	case d < 24*time.Hour:
		return fmt.Sprintf("%dh ago", int(d.Hours()))
	default:
		return fmt.Sprintf("%dd ago", int(d.Hours()/24))
	}
}

func connectURLToken(raw string) string {
	u, err := url.Parse(raw)
	if err != nil {
		return ""
	}
	if t := u.Query().Get("token"); t != "" {
		return t
	}
	fragment, err := url.ParseQuery(u.Fragment)
	if err != nil {
		return ""
	}
	return fragment.Get("token")
}
