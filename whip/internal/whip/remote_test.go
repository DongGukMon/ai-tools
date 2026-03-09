package whip

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestEnsureWhipHome_SeedsDefaults(t *testing.T) {
	baseDir := filepath.Join(t.TempDir(), whipDir)

	paths, err := ensureWhipHome(baseDir)
	if err != nil {
		t.Fatalf("ensureWhipHome: %v", err)
	}

	if data, err := os.ReadFile(paths.Prompt); err != nil {
		t.Fatalf("read prompt.md: %v", err)
	} else if string(data) != defaultMasterPrompt() {
		t.Fatalf("prompt.md = %q, want default master prompt", string(data))
	}

	if data, err := os.ReadFile(paths.Memory); err != nil {
		t.Fatalf("read memory.md: %v", err)
	} else if string(data) != defaultWhipMemoryTemplate() {
		t.Fatalf("memory.md = %q, want default template", string(data))
	}

	if data, err := os.ReadFile(paths.Projects); err != nil {
		t.Fatalf("read projects.md: %v", err)
	} else if string(data) != defaultWhipProjectsTemplate() {
		t.Fatalf("projects.md = %q, want default template", string(data))
	}
}

func TestEnsureWhipHome_PreservesExistingFiles(t *testing.T) {
	baseDir := filepath.Join(t.TempDir(), whipDir)
	paths := whipHomePathsFor(baseDir)

	if err := os.MkdirAll(paths.Dir, 0o755); err != nil {
		t.Fatalf("mkdir home dir: %v", err)
	}
	const customPrompt = "# Custom Prompt\n"
	if err := os.WriteFile(paths.Prompt, []byte(customPrompt), 0o644); err != nil {
		t.Fatalf("write custom prompt: %v", err)
	}

	seeded, err := ensureWhipHome(baseDir)
	if err != nil {
		t.Fatalf("ensureWhipHome: %v", err)
	}

	if data, err := os.ReadFile(seeded.Prompt); err != nil {
		t.Fatalf("read prompt.md: %v", err)
	} else if string(data) != customPrompt {
		t.Fatalf("prompt.md = %q, want existing content preserved", string(data))
	}

	if _, err := os.Stat(seeded.Memory); err != nil {
		t.Fatalf("memory.md should be created: %v", err)
	}
	if _, err := os.Stat(seeded.Projects); err != nil {
		t.Fatalf("projects.md should be created: %v", err)
	}
}

func TestPrepareMasterPrompt_CodexAppendsSilentWorkerFallback(t *testing.T) {
	baseDir := filepath.Join(t.TempDir(), whipDir)
	paths, err := ensureWhipHome(baseDir)
	if err != nil {
		t.Fatalf("ensureWhipHome: %v", err)
	}

	const customPrompt = "# Custom Prompt\n\nFollow the operator.\n"
	if err := os.WriteFile(paths.Prompt, []byte(customPrompt), 0o644); err != nil {
		t.Fatalf("write custom prompt: %v", err)
	}

	promptPath, err := prepareMasterPrompt(paths, "codex")
	if err != nil {
		t.Fatalf("prepareMasterPrompt: %v", err)
	}
	if promptPath != paths.PromptCodex {
		t.Fatalf("prompt path = %q, want %q", promptPath, paths.PromptCodex)
	}

	data, err := os.ReadFile(promptPath)
	if err != nil {
		t.Fatalf("read codex prompt: %v", err)
	}
	prompt := string(data)
	if !strings.Contains(prompt, customPrompt) {
		t.Fatalf("codex prompt should preserve shared prompt content: %q", prompt)
	}
	if !strings.Contains(prompt, codexMasterPromptHeading) {
		t.Fatalf("codex prompt should contain silent worker fallback guidance")
	}
	if !strings.Contains(prompt, "Attach to the tmux session or send input to it.") {
		t.Fatalf("codex prompt should mention tmux attach or send input guidance")
	}
	if !strings.Contains(prompt, "Press Enter / submit the prompt so the worker actually processes the instruction.") {
		t.Fatalf("codex prompt should mention submitting the prompt")
	}
}

func TestSpawnMasterSession_UsesHomePromptPath(t *testing.T) {
	tempHome := t.TempDir()
	t.Setenv("HOME", tempHome)

	var gotSessionName string
	var gotShellCmd string

	origSpawn := spawnMasterTmuxSession
	spawnMasterTmuxSession = func(sessionName string, shellCmd string) error {
		gotSessionName = sessionName
		gotShellCmd = shellCmd
		return nil
	}
	defer func() {
		spawnMasterTmuxSession = origSpawn
	}()

	cfg := RemoteConfig{
		Backend:    "claude",
		Difficulty: "medium",
		CWD:        t.TempDir(),
	}
	if err := SpawnMasterSession(cfg); err != nil {
		t.Fatalf("SpawnMasterSession: %v", err)
	}

	wantPromptPath := filepath.Join(tempHome, whipDir, whipHomeDirName, whipHomePromptFile)
	if gotSessionName != MasterSessionName {
		t.Fatalf("session name = %q, want %q", gotSessionName, MasterSessionName)
	}
	if !strings.Contains(gotShellCmd, wantPromptPath) {
		t.Fatalf("shell command should reference %q: %s", wantPromptPath, gotShellCmd)
	}

	for _, path := range []string{
		wantPromptPath,
		filepath.Join(tempHome, whipDir, whipHomeDirName, whipHomeMemoryFile),
		filepath.Join(tempHome, whipDir, whipHomeDirName, whipHomeProjectsFile),
	} {
		if _, err := os.Stat(path); err != nil {
			t.Fatalf("expected seeded file %q: %v", path, err)
		}
	}
}

func TestSpawnMasterSession_CodexUsesDerivedPromptPath(t *testing.T) {
	tempHome := t.TempDir()
	t.Setenv("HOME", tempHome)

	var gotShellCmd string

	origSpawn := spawnMasterTmuxSession
	spawnMasterTmuxSession = func(sessionName string, shellCmd string) error {
		gotShellCmd = shellCmd
		return nil
	}
	defer func() {
		spawnMasterTmuxSession = origSpawn
	}()

	cfg := RemoteConfig{
		Backend:    "codex",
		Difficulty: "medium",
		CWD:        t.TempDir(),
	}
	if err := SpawnMasterSession(cfg); err != nil {
		t.Fatalf("SpawnMasterSession: %v", err)
	}

	wantPromptPath := filepath.Join(tempHome, whipDir, whipHomeDirName, whipHomePromptCodex)
	if !strings.Contains(gotShellCmd, wantPromptPath) {
		t.Fatalf("shell command should reference %q: %s", wantPromptPath, gotShellCmd)
	}

	data, err := os.ReadFile(wantPromptPath)
	if err != nil {
		t.Fatalf("read codex prompt: %v", err)
	}
	if !strings.Contains(string(data), codexMasterPromptHeading) {
		t.Fatalf("derived Codex prompt should contain silent worker fallback guidance")
	}
}

func TestSpawnMasterSession_UsesWHIPHOMEOverride(t *testing.T) {
	tempHome := t.TempDir()
	t.Setenv("HOME", tempHome)

	override := filepath.Join(tempHome, whipDir, "custom-whip-home")
	t.Setenv("WHIP_HOME", override)

	var gotShellCmd string

	origSpawn := spawnMasterTmuxSession
	spawnMasterTmuxSession = func(sessionName string, shellCmd string) error {
		gotShellCmd = shellCmd
		return nil
	}
	defer func() {
		spawnMasterTmuxSession = origSpawn
	}()

	cfg := RemoteConfig{
		Backend:    "claude",
		Difficulty: "medium",
		CWD:        t.TempDir(),
	}
	if err := SpawnMasterSession(cfg); err != nil {
		t.Fatalf("SpawnMasterSession: %v", err)
	}

	resolvedOverride, err := canonicalizeStorePath(override)
	if err != nil {
		t.Fatalf("canonicalizeStorePath: %v", err)
	}
	wantPromptPath := filepath.Join(resolvedOverride, whipHomeDirName, whipHomePromptFile)
	if !strings.Contains(gotShellCmd, wantPromptPath) {
		t.Fatalf("shell command should reference %q: %s", wantPromptPath, gotShellCmd)
	}
}

func TestSpawnMasterSession_UsesWorkspaceSpecificMasterIdentity(t *testing.T) {
	tempHome := t.TempDir()
	t.Setenv("HOME", tempHome)

	var gotSessionName string
	var gotShellCmd string

	origSpawn := spawnMasterTmuxSession
	spawnMasterTmuxSession = func(sessionName string, shellCmd string) error {
		gotSessionName = sessionName
		gotShellCmd = shellCmd
		return nil
	}
	defer func() {
		spawnMasterTmuxSession = origSpawn
	}()

	cfg := RemoteConfig{
		Backend:    "claude",
		Difficulty: "medium",
		CWD:        t.TempDir(),
		Workspace:  "issue-sweep",
	}
	if err := SpawnMasterSession(cfg); err != nil {
		t.Fatalf("SpawnMasterSession: %v", err)
	}

	if gotSessionName != WorkspaceMasterSessionName("issue-sweep") {
		t.Fatalf("session name = %q, want %q", gotSessionName, WorkspaceMasterSessionName("issue-sweep"))
	}
	if !strings.Contains(gotShellCmd, "WHIP_MASTER_IRC="+shellEscape(WorkspaceMasterIRCName("issue-sweep"))) {
		t.Fatalf("shell command should export workspace master IRC: %s", gotShellCmd)
	}
}

func TestNormalizeRemoteAuthModeDefaultsToDevice(t *testing.T) {
	if got := NormalizeRemoteAuthMode(""); got != RemoteAuthModeDevice {
		t.Fatalf("NormalizeRemoteAuthMode(\"\") = %q, want %q", got, RemoteAuthModeDevice)
	}
}
