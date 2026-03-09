package whip

import (
	"fmt"
	"os"
	"os/exec"
	"syscall"
)

var startDetachedShellCommand = func(command string) error {
	cmd := exec.Command("sh", "-c", command)
	cmd.SysProcAttr = &syscall.SysProcAttr{Setsid: true}
	return cmd.Start()
}

func SpawnTerminal(taskID string, shellCmd string) error {
	script := fmt.Sprintf(
		`tell application "Terminal" to do script %s`,
		appleScriptString(shellCmd),
	)

	cmd := exec.Command("osascript", "-e", script)
	cmd.Stdout = os.Stderr
	cmd.Stderr = os.Stderr
	return cmd.Run()
}

func SpawnDashboard() error {
	script := fmt.Sprintf(
		`tell application "Terminal" to do script %s`,
		appleScriptString("whip dashboard"),
	)
	cmd := exec.Command("osascript", "-e", script)
	cmd.Stdout = os.Stderr
	cmd.Stderr = os.Stderr
	return cmd.Run()
}
