package server

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
	"testing/fstest"
	"time"

	"github.com/bang9/ai-tools/rewind/internal/parser"
)

func TestInjectSessionDataEscapesClosingScriptTag(t *testing.T) {
	indexHTML := []byte(`<!doctype html><html><head></head><body><script type="module" src="./assets/index.js"></script></body></html>`)
	sessionJSON := []byte(`{"content":"</script><script>alert(1)</script>"}`)

	rendered, err := injectSessionData(indexHTML, sessionJSON)
	if err != nil {
		t.Fatalf("injectSessionData returned error: %v", err)
	}

	html := string(rendered)
	if !strings.Contains(html, `<script id="rewind-session-data" type="application/json">{"content":"<\/script><script>alert(1)<\/script>"}</script>`) {
		t.Fatalf("expected injected session JSON to be escaped, got %q", html)
	}
	if !strings.Contains(html, `<meta name="referrer" content="no-referrer" />`) {
		t.Fatal("expected no-referrer meta tag to be injected")
	}
	if !strings.Contains(html, `Content-Security-Policy`) {
		t.Fatal("expected CSP meta tag to be injected")
	}
}

func TestExportViewerWritesIndexAndAssets(t *testing.T) {
	outputDir := t.TempDir()

	indexPath, err := exportViewer(fstest.MapFS{
		"index.html":     &fstest.MapFile{Data: []byte(`<!doctype html><html><head><link rel="stylesheet" href="./assets/app.css"></head><body><script type="module" src="./assets/app.js"></script></body></html>`)},
		"assets/app.js":  &fstest.MapFile{Data: []byte("console.log('ok')")},
		"assets/app.css": &fstest.MapFile{Data: []byte("body{color:black}")},
	}, outputDir, []byte(`{"id":"session-1"}`), nil)
	if err != nil {
		t.Fatalf("exportViewer returned error: %v", err)
	}

	if indexPath != filepath.Join(outputDir, "index.html") {
		t.Fatalf("expected index path in output dir, got %q", indexPath)
	}

	indexHTML, err := os.ReadFile(indexPath)
	if err != nil {
		t.Fatalf("failed to read rendered index: %v", err)
	}
	html := string(indexHTML)
	if !strings.Contains(html, `id=rewind-session-data`) && !strings.Contains(html, `id="rewind-session-data"`) {
		t.Fatalf("expected session payload in rendered index, got %q", string(indexHTML))
	}
	if !strings.Contains(html, `"id":"session-1"`) {
		t.Fatalf("expected session payload in rendered index, got %q", string(indexHTML))
	}
	if !strings.Contains(html, "<style>") || !strings.Contains(html, "body{color:") {
		t.Fatalf("expected CSS asset to be inlined, got %q", string(indexHTML))
	}
	if !strings.Contains(html, "<script type=module>") || !strings.Contains(html, "console.log") {
		t.Fatalf("expected JS asset to be inlined, got %q", string(indexHTML))
	}
	if strings.Contains(html, ">\n<") {
		t.Fatalf("expected HTML to be minified, got %q", string(indexHTML))
	}
	if strings.Contains(html, "./assets/") {
		t.Fatalf("expected asset references to be removed, got %q", string(indexHTML))
	}
	if _, err := os.Stat(filepath.Join(outputDir, "assets")); !os.IsNotExist(err) {
		t.Fatalf("expected no asset directory to be written, got err=%v", err)
	}
}

func TestCleanupViewerDirsRemovesOnlyStaleEntries(t *testing.T) {
	root := t.TempDir()
	now := time.Date(2026, 3, 12, 9, 30, 0, 0, time.UTC)

	staleDir := filepath.Join(root, viewerDirPrefix+"stale")
	freshDir := filepath.Join(root, viewerDirPrefix+"fresh")
	otherDir := filepath.Join(root, "other-dir")
	for _, dir := range []string{staleDir, freshDir, otherDir} {
		if err := os.MkdirAll(dir, 0o700); err != nil {
			t.Fatalf("failed to create test dir %s: %v", dir, err)
		}
	}

	if err := os.Chtimes(staleDir, now.Add(-staleViewerTTL-time.Minute), now.Add(-staleViewerTTL-time.Minute)); err != nil {
		t.Fatalf("failed to age stale dir: %v", err)
	}
	if err := os.Chtimes(freshDir, now.Add(-5*time.Minute), now.Add(-5*time.Minute)); err != nil {
		t.Fatalf("failed to age fresh dir: %v", err)
	}
	if err := os.Chtimes(otherDir, now.Add(-staleViewerTTL-time.Minute), now.Add(-staleViewerTTL-time.Minute)); err != nil {
		t.Fatalf("failed to age other dir: %v", err)
	}

	removed, err := cleanupViewerDirs(root, now, staleViewerTTL)
	if err != nil {
		t.Fatalf("cleanupViewerDirs returned error: %v", err)
	}
	if removed != 1 {
		t.Fatalf("expected 1 removed dir, got %d", removed)
	}

	if _, err := os.Stat(staleDir); !os.IsNotExist(err) {
		t.Fatalf("expected stale dir to be removed, got err=%v", err)
	}
	if _, err := os.Stat(freshDir); err != nil {
		t.Fatalf("expected fresh dir to remain, got err=%v", err)
	}
	if _, err := os.Stat(otherDir); err != nil {
		t.Fatalf("expected non-viewer dir to remain, got err=%v", err)
	}
}

func TestRunWritesViewerUnderUserHome(t *testing.T) {
	tempHome := t.TempDir()
	restore := stubUserHomeDir(tempHome)
	defer restore()

	originalOpenBrowser := OpenBrowser
	OpenBrowser = func(path string) error {
		t.Fatalf("OpenBrowser should not be called when auto-open is disabled: %s", path)
		return nil
	}
	defer func() {
		OpenBrowser = originalOpenBrowser
	}()

	session := &parser.Session{
		ID:      "session-1",
		Backend: "codex",
		Events: []parser.TimelineEvent{
			{
				Timestamp: time.Date(2026, 3, 12, 10, 0, 0, 0, time.UTC),
				Type:      "user",
				Role:      "user",
				Summary:   "question",
				Content:   "question",
			},
		},
	}

	if err := Run(session, Options{OpenBrowser: false}); err != nil {
		t.Fatalf("Run returned error: %v", err)
	}

	viewerRoot := filepath.Join(tempHome, ".rewind", "viewers")
	entries, err := os.ReadDir(viewerRoot)
	if err != nil {
		t.Fatalf("failed to read viewer root: %v", err)
	}

	expectedDirName := viewerDirPrefix + "session-1"
	viewerDir := filepath.Join(viewerRoot, expectedDirName)
	if _, err := os.Stat(viewerDir); err != nil {
		t.Fatalf("expected viewer directory %q, got err=%v (entries: %v)", expectedDirName, err, entries)
	}

	indexHTML, err := os.ReadFile(filepath.Join(viewerDir, "index.html"))
	if err != nil {
		t.Fatalf("failed to read exported viewer index: %v", err)
	}
	if !strings.Contains(string(indexHTML), `"id":"session-1"`) {
		t.Fatalf("expected exported viewer to include session payload, got %q", string(indexHTML))
	}
}

func TestPrepareViewerExportRootCreatesPrivateDirectories(t *testing.T) {
	tempHome := t.TempDir()
	originalUserHomeDir := userHomeDir
	userHomeDir = func() (string, error) {
		return tempHome, nil
	}
	t.Cleanup(func() {
		userHomeDir = originalUserHomeDir
	})

	root, err := prepareViewerExportRoot()
	if err != nil {
		t.Fatalf("prepareViewerExportRoot returned error: %v", err)
	}

	expectedRoot := filepath.Join(tempHome, ".rewind", "viewers")
	if root != expectedRoot {
		t.Fatalf("expected viewer root %q, got %q", expectedRoot, root)
	}

	info, err := os.Stat(root)
	if err != nil {
		t.Fatalf("failed to stat viewer root: %v", err)
	}
	if !info.IsDir() {
		t.Fatalf("expected viewer root to be a directory, got mode %v", info.Mode())
	}
}

func TestPrepareViewerExportRootRejectsSymlinkedDirectories(t *testing.T) {
	tempHome := t.TempDir()
	redirectedRoot := t.TempDir()
	if err := os.Symlink(redirectedRoot, filepath.Join(tempHome, ".rewind")); err != nil {
		t.Fatalf("failed to create symlinked .rewind dir: %v", err)
	}

	originalUserHomeDir := userHomeDir
	userHomeDir = func() (string, error) {
		return tempHome, nil
	}
	t.Cleanup(func() {
		userHomeDir = originalUserHomeDir
	})

	_, err := prepareViewerExportRoot()
	if err == nil {
		t.Fatal("expected symlinked viewer root to be rejected")
	}
	if !strings.Contains(err.Error(), "must not be a symlink") {
		t.Fatalf("expected symlink rejection error, got %v", err)
	}
}

func TestPrepareViewerExportRootRejectsSymlinkedRewindStateDir(t *testing.T) {
	tempHome := t.TempDir()
	restore := stubUserHomeDir(tempHome)
	defer restore()

	targetDir := filepath.Join(t.TempDir(), "real-rewind")
	if err := os.MkdirAll(targetDir, 0o700); err != nil {
		t.Fatalf("failed to create real rewind dir: %v", err)
	}
	if err := os.Symlink(targetDir, filepath.Join(tempHome, ".rewind")); err != nil {
		t.Fatalf("failed to create symlinked rewind dir: %v", err)
	}

	if _, err := prepareViewerExportRoot(); err == nil {
		t.Fatal("expected symlinked rewind state dir to be rejected")
	}
}

func TestPrepareViewerExportRootRejectsSymlinkedViewerDir(t *testing.T) {
	tempHome := t.TempDir()
	restore := stubUserHomeDir(tempHome)
	defer restore()

	if err := os.MkdirAll(filepath.Join(tempHome, ".rewind"), 0o700); err != nil {
		t.Fatalf("failed to create rewind state dir: %v", err)
	}
	targetDir := filepath.Join(t.TempDir(), "real-viewers")
	if err := os.MkdirAll(targetDir, 0o700); err != nil {
		t.Fatalf("failed to create real viewers dir: %v", err)
	}
	if err := os.Symlink(targetDir, filepath.Join(tempHome, ".rewind", "viewers")); err != nil {
		t.Fatalf("failed to create symlinked viewer dir: %v", err)
	}

	if _, err := prepareViewerExportRoot(); err == nil {
		t.Fatal("expected symlinked viewer dir to be rejected")
	}
}

func TestRunOverwritesExistingViewerForSameSession(t *testing.T) {
	tempHome := t.TempDir()
	restore := stubUserHomeDir(tempHome)
	defer restore()

	originalOpenBrowser := OpenBrowser
	OpenBrowser = func(path string) error { return nil }
	defer func() { OpenBrowser = originalOpenBrowser }()

	session := &parser.Session{
		ID:      "session-overwrite",
		Backend: "claude",
		Events: []parser.TimelineEvent{
			{
				Timestamp: time.Date(2026, 3, 12, 10, 0, 0, 0, time.UTC),
				Type:      "user",
				Role:      "user",
				Summary:   "first run",
				Content:   "first run",
			},
		},
	}

	if err := Run(session, Options{OpenBrowser: false}); err != nil {
		t.Fatalf("first Run returned error: %v", err)
	}

	session.Events[0].Content = "second run"
	if err := Run(session, Options{OpenBrowser: false}); err != nil {
		t.Fatalf("second Run returned error: %v", err)
	}

	viewerRoot := filepath.Join(tempHome, ".rewind", "viewers")
	entries, err := os.ReadDir(viewerRoot)
	if err != nil {
		t.Fatalf("failed to read viewer root: %v", err)
	}

	viewerCount := 0
	for _, entry := range entries {
		if entry.IsDir() && strings.HasPrefix(entry.Name(), viewerDirPrefix) {
			viewerCount++
		}
	}
	if viewerCount != 1 {
		t.Fatalf("expected exactly 1 viewer directory after re-export, got %d", viewerCount)
	}

	indexHTML, err := os.ReadFile(filepath.Join(viewerRoot, viewerDirPrefix+"session-overwrite", "index.html"))
	if err != nil {
		t.Fatalf("failed to read overwritten viewer: %v", err)
	}
	if !strings.Contains(string(indexHTML), "second run") {
		t.Fatal("expected overwritten viewer to contain updated session data")
	}
}

func TestSanitizeViewerDirName(t *testing.T) {
	tests := []struct {
		input string
		want  string
	}{
		{"abc-123_XYZ", "abc-123_XYZ"},
		{"", ""},
		{"../../../etc/passwd", "etcpasswd"},
		{"session with spaces", "sessionwithspaces"},
		{"a/b\\c", "abc"},
		{strings.Repeat("x", 200), strings.Repeat("x", 128)},
	}
	for _, tt := range tests {
		got := sanitizeViewerDirName(tt.input)
		if got != tt.want {
			t.Errorf("sanitizeViewerDirName(%q) = %q, want %q", tt.input, got, tt.want)
		}
	}
}

func TestPrepareViewerDirFallsBackToTempForEmptySessionID(t *testing.T) {
	root := t.TempDir()
	dir, err := prepareViewerDir(root, "")
	if err != nil {
		t.Fatalf("prepareViewerDir returned error: %v", err)
	}
	if !strings.HasPrefix(filepath.Base(dir), viewerDirPrefix) {
		t.Fatalf("expected temp dir with prefix %q, got %q", viewerDirPrefix, filepath.Base(dir))
	}
}

func stubUserHomeDir(home string) func() {
	previous := userHomeDir
	userHomeDir = func() (string, error) {
		return home, nil
	}
	return func() {
		userHomeDir = previous
	}
}
