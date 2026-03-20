package server

import (
	"encoding/json"
	"errors"
	"fmt"
	"io/fs"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"runtime"
	"strings"
	"time"

	"github.com/bang9/ai-tools/rewind/internal/parser"
	"github.com/bang9/ai-tools/rewind/web"
	"github.com/tdewolff/minify/v2"
	"github.com/tdewolff/minify/v2/css"
	htmlmin "github.com/tdewolff/minify/v2/html"
	"github.com/tdewolff/minify/v2/js"
)

// OpenBrowser is a package-level function for opening viewer files in the browser.
var OpenBrowser = openBrowser

const (
	referrerMeta     = `<meta name="referrer" content="no-referrer" />`
	cspMeta          = `<meta http-equiv="Content-Security-Policy" content="default-src 'self'; base-uri 'none'; connect-src 'none'; font-src 'self' data:; img-src 'self' data:; object-src 'none'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'" />`
	sessionDataID    = "rewind-session-data"
	analysisDataID   = "rewind-analysis-data"
	staleViewerTTL   = 30 * time.Minute
	viewerDirPrefix  = "rewind-view-"
)

var (
	moduleScriptPattern = regexp.MustCompile(`<script[^>]*type="module"[^>]*src="([^"]+)"[^>]*>\s*</script>`)
	stylesheetPattern   = regexp.MustCompile(`<link[^>]*rel="stylesheet"[^>]*href="([^"]+)"[^>]*>`)
	viewerMinifier      = newViewerMinifier()
	userHomeDir         = os.UserHomeDir
)

type Options struct {
	Port         int
	OpenBrowser  bool
	AnalysisPath string // Optional path to analysis JSON sidecar file
	SessionPath  string // Original session JSONL path (for auto-detecting sidecar)
	SessionID    string // Session ID (for ~/.rewind/analysis/<id>.json lookup)
}

// Run exports a static viewer bundle with the session data embedded into the
// generated index.html, then optionally opens it in the default browser.
func Run(session *parser.Session, options Options) error {
	distFS, err := fs.Sub(web.StaticFS, "dist")
	if err != nil {
		return fmt.Errorf("failed to access embedded dist: %w", err)
	}

	if _, err := CleanupStaleViewerDirs(); err != nil {
		fmt.Fprintf(os.Stderr, "Warning: failed to remove stale viewer directories: %v\n", err)
	}

	sessionJSON, err := json.Marshal(session)
	if err != nil {
		return fmt.Errorf("failed to marshal session: %w", err)
	}

	analysisJSON := loadAnalysisJSON(options)

	viewerRoot, err := prepareViewerExportRoot()
	if err != nil {
		return err
	}

	viewerDir, err := prepareViewerDir(viewerRoot, session.ID)
	if err != nil {
		return fmt.Errorf("failed to create viewer directory: %w", err)
	}

	viewerPath, err := exportViewer(distFS, viewerDir, sessionJSON, analysisJSON)
	if err != nil {
		_ = os.RemoveAll(viewerDir)
		return err
	}

	if options.Port != 0 {
		fmt.Fprintln(os.Stderr, "Note: --port is ignored in static viewer mode")
	}

	fmt.Fprintf(os.Stderr, "Session viewer: %s\n", viewerPath)

	if options.OpenBrowser {
		fmt.Fprintln(os.Stderr, "Opening exported session viewer")
		if err := OpenBrowser(viewerPath); err != nil {
			return err
		}
		return nil
	}

	fmt.Fprintln(os.Stderr, "Auto-open disabled")
	return nil
}

// CleanupStaleViewerDirs removes exported viewer directories older than the
// configured stale TTL and returns the number removed.
func CleanupStaleViewerDirs() (int, error) {
	root, err := prepareViewerExportRoot()
	if err != nil {
		return 0, err
	}
	return cleanupViewerDirs(root, time.Now(), staleViewerTTL)
}

func exportViewer(distFS fs.FS, outputDir string, sessionJSON []byte, analysisJSON []byte) (string, error) {
	indexHTML, err := fs.ReadFile(distFS, "index.html")
	if err != nil {
		return "", fmt.Errorf("failed to read viewer index: %w", err)
	}

	inlinedIndex, err := inlineAssets(indexHTML, distFS)
	if err != nil {
		return "", err
	}

	renderedIndex, err := injectSessionData(inlinedIndex, sessionJSON)
	if err != nil {
		return "", err
	}

	if len(analysisJSON) > 0 {
		renderedIndex, err = injectAnalysisData(renderedIndex, analysisJSON)
		if err != nil {
			return "", err
		}
	}

	renderedIndex, err = minifyHTMLDocument(renderedIndex)
	if err != nil {
		return "", err
	}

	indexPath := filepath.Join(outputDir, "index.html")
	if err := os.WriteFile(indexPath, renderedIndex, 0o600); err != nil {
		return "", fmt.Errorf("failed to write viewer index: %w", err)
	}

	return indexPath, nil
}

func inlineAssets(indexHTML []byte, distFS fs.FS) ([]byte, error) {
	html := string(indexHTML)

	var err error
	html, err = replaceAssetRefs(html, distFS, stylesheetPattern, func(content []byte) (string, error) {
		minified, err := minifyAsset("text/css", content)
		if err != nil {
			return "", err
		}
		return "<style>" + string(minified) + "</style>", nil
	})
	if err != nil {
		return nil, err
	}

	html, err = replaceAssetRefs(html, distFS, moduleScriptPattern, func(content []byte) (string, error) {
		minified, err := minifyAsset("application/javascript", content)
		if err != nil {
			return "", err
		}
		return "<script type=\"module\">" + string(minified) + "</script>", nil
	})
	if err != nil {
		return nil, err
	}

	return []byte(html), nil
}

func replaceAssetRefs(html string, distFS fs.FS, pattern *regexp.Regexp, render func([]byte) (string, error)) (string, error) {
	matches := pattern.FindAllStringSubmatch(html, -1)
	for _, match := range matches {
		if len(match) < 2 {
			continue
		}

		assetPath, err := normalizeAssetPath(match[1])
		if err != nil {
			return "", err
		}

		assetBytes, err := fs.ReadFile(distFS, assetPath)
		if err != nil {
			return "", fmt.Errorf("failed to read embedded asset %s: %w", assetPath, err)
		}

		rendered, err := render(assetBytes)
		if err != nil {
			return "", err
		}

		html = strings.Replace(html, match[0], rendered, 1)
	}

	return html, nil
}

func normalizeAssetPath(raw string) (string, error) {
	path := strings.TrimSpace(raw)
	path = strings.TrimPrefix(path, "./")
	path = strings.TrimPrefix(path, "/")
	path = filepath.ToSlash(filepath.Clean(path))
	if path == "." || path == "" || strings.HasPrefix(path, "../") {
		return "", fmt.Errorf("invalid embedded asset path: %q", raw)
	}
	return path, nil
}

func injectSessionData(indexHTML, sessionJSON []byte) ([]byte, error) {
	bootstrap := `<script id="` + sessionDataID + `" type="application/json">` + escapeInlineJSON(sessionJSON) + `</script>`

	html := string(indexHTML)
	switch {
	case strings.Contains(html, "<script"):
		html = strings.Replace(html, "<script", bootstrap+"<script", 1)
	case strings.Contains(html, "</head>"):
		html = strings.Replace(html, "</head>", bootstrap+"</head>", 1)
	default:
		return nil, fmt.Errorf("viewer index is missing an injection point")
	}

	if strings.Contains(html, "</head>") {
		headInsertions := make([]string, 0, 2)
		if !strings.Contains(html, cspMeta) {
			headInsertions = append(headInsertions, cspMeta)
		}
		if !strings.Contains(html, referrerMeta) {
			headInsertions = append(headInsertions, referrerMeta)
		}
		if len(headInsertions) > 0 {
			html = strings.Replace(html, "</head>", strings.Join(headInsertions, "")+"</head>", 1)
		}
	}

	return []byte(html), nil
}

func minifyHTMLDocument(html []byte) ([]byte, error) {
	minified, err := viewerMinifier.Bytes("text/html", html)
	if err != nil {
		return nil, fmt.Errorf("failed to minify viewer html: %w", err)
	}
	return minified, nil
}

func minifyAsset(mime string, content []byte) ([]byte, error) {
	minified, err := viewerMinifier.Bytes(mime, content)
	if err != nil {
		return nil, fmt.Errorf("failed to minify %s asset: %w", mime, err)
	}
	return minified, nil
}

func newViewerMinifier() *minify.M {
	m := minify.New()
	m.AddFunc("text/html", htmlmin.Minify)
	m.AddFunc("text/css", css.Minify)
	m.AddFunc("application/javascript", js.Minify)
	m.AddFunc("text/javascript", js.Minify)
	return m
}

func loadAnalysisJSON(options Options) []byte {
	// Check explicit path first
	if options.AnalysisPath != "" {
		data, err := os.ReadFile(options.AnalysisPath)
		if err == nil && json.Valid(data) {
			return data
		}
		return nil
	}
	// Check ~/.rewind/analysis/<session-id>.json
	if options.SessionID != "" {
		if p, err := AnalysisPath(options.SessionID); err == nil {
			data, err := os.ReadFile(p)
			if err == nil && json.Valid(data) {
				return data
			}
		}
	}
	// Fallback: sidecar <session-path>.analysis.json
	if options.SessionPath != "" {
		sidecar := options.SessionPath + ".analysis.json"
		data, err := os.ReadFile(sidecar)
		if err == nil && json.Valid(data) {
			return data
		}
	}
	return nil
}

// AnalysisPath returns the canonical path for a session's analysis file.
func AnalysisPath(sessionID string) (string, error) {
	homeDir, err := userHomeDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(homeDir, ".rewind", "analysis", sessionID+".json"), nil
}

// PrepareAnalysisDir ensures ~/.rewind/analysis/ exists.
func PrepareAnalysisDir() (string, error) {
	homeDir, err := userHomeDir()
	if err != nil {
		return "", err
	}
	dir := filepath.Join(homeDir, ".rewind", "analysis")
	if err := ensurePrivateDirTree(homeDir, dir, 0o700); err != nil {
		return "", err
	}
	return dir, nil
}

func injectAnalysisData(indexHTML, analysisJSON []byte) ([]byte, error) {
	tag := `<script id="` + analysisDataID + `" type="application/json">` + escapeInlineJSON(analysisJSON) + `</script>`

	html := string(indexHTML)
	switch {
	case strings.Contains(html, "<script"):
		html = strings.Replace(html, "<script", tag+"<script", 1)
	case strings.Contains(html, "</head>"):
		html = strings.Replace(html, "</head>", tag+"</head>", 1)
	default:
		return nil, fmt.Errorf("viewer index is missing an injection point for analysis data")
	}

	return []byte(html), nil
}

func escapeInlineJSON(sessionJSON []byte) string {
	replacer := strings.NewReplacer(
		"</", "<\\/",
		"\u2028", "\\u2028",
		"\u2029", "\\u2029",
	)
	return replacer.Replace(string(sessionJSON))
}

func viewerExportRoot() (string, error) {
	homeDir, err := userHomeDir()
	if err != nil {
		return "", fmt.Errorf("failed to resolve user home directory: %w", err)
	}
	if homeDir == "" {
		return "", fmt.Errorf("user home directory is empty")
	}
	return filepath.Join(homeDir, ".rewind", "viewers"), nil
}

func prepareViewerExportRoot() (string, error) {
	root, err := viewerExportRoot()
	if err != nil {
		return "", err
	}

	homeDir, err := userHomeDir()
	if err != nil {
		return "", fmt.Errorf("failed to resolve user home directory: %w", err)
	}
	if err := ensurePrivateDirTree(homeDir, filepath.Join(homeDir, ".rewind"), 0o700); err != nil {
		return "", err
	}
	if err := ensurePrivateDirTree(homeDir, root, 0o700); err != nil {
		return "", err
	}
	return root, nil
}

func ensurePrivateDirTree(base, target string, mode os.FileMode) error {
	relPath, err := filepath.Rel(base, target)
	if err != nil {
		return fmt.Errorf("failed to resolve viewer directory: %w", err)
	}
	if relPath == ".." || strings.HasPrefix(relPath, ".."+string(os.PathSeparator)) {
		return fmt.Errorf("viewer directory must stay under %s", base)
	}

	current := base
	for _, part := range strings.Split(relPath, string(os.PathSeparator)) {
		if part == "" || part == "." {
			continue
		}
		current = filepath.Join(current, part)

		info, err := os.Lstat(current)
		if err != nil {
			if errors.Is(err, os.ErrNotExist) {
				if err := os.Mkdir(current, mode); err != nil {
					return fmt.Errorf("failed to create viewer directory %s: %w", current, err)
				}
				continue
			}
			return fmt.Errorf("failed to inspect viewer directory %s: %w", current, err)
		}
		if info.Mode()&os.ModeSymlink != 0 {
			return fmt.Errorf("viewer directory must not be a symlink: %s", current)
		}
		if !info.IsDir() {
			return fmt.Errorf("viewer directory path must be a directory: %s", current)
		}
	}

	return nil
}

func prepareViewerDir(root, sessionID string) (string, error) {
	sanitized := sanitizeViewerDirName(sessionID)
	if sanitized == "" {
		return os.MkdirTemp(root, viewerDirPrefix)
	}

	dir := filepath.Join(root, viewerDirPrefix+sanitized)
	_ = os.RemoveAll(dir)
	if err := os.Mkdir(dir, 0o700); err != nil {
		return "", err
	}
	return dir, nil
}

func sanitizeViewerDirName(sessionID string) string {
	if sessionID == "" {
		return ""
	}
	var b strings.Builder
	for _, r := range sessionID {
		if (r >= 'a' && r <= 'z') || (r >= 'A' && r <= 'Z') || (r >= '0' && r <= '9') || r == '-' || r == '_' {
			b.WriteRune(r)
		}
	}
	result := b.String()
	if len(result) > 128 {
		result = result[:128]
	}
	return result
}

func cleanupViewerDirs(root string, now time.Time, ttl time.Duration) (int, error) {
	entries, err := os.ReadDir(root)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return 0, nil
		}
		return 0, fmt.Errorf("failed to read viewer cache directory: %w", err)
	}

	cutoff := now.Add(-ttl)
	removed := 0
	for _, entry := range entries {
		if !entry.IsDir() || !strings.HasPrefix(entry.Name(), viewerDirPrefix) {
			continue
		}

		info, err := entry.Info()
		if err != nil || info.ModTime().After(cutoff) {
			continue
		}

		if err := os.RemoveAll(filepath.Join(root, entry.Name())); err != nil {
			return removed, fmt.Errorf("failed to remove stale viewer directory %s: %w", entry.Name(), err)
		}
		removed++
	}

	return removed, nil
}

func openBrowser(path string) error {
	var cmd *exec.Cmd
	switch runtime.GOOS {
	case "darwin":
		cmd = exec.Command("open", path)
	case "linux":
		cmd = exec.Command("xdg-open", path)
	case "windows":
		cmd = exec.Command("rundll32", "url.dll,FileProtocolHandler", path)
	}
	if cmd == nil {
		return fmt.Errorf("unsupported platform for browser auto-open: %s", runtime.GOOS)
	}
	if err := cmd.Run(); err != nil {
		return fmt.Errorf("failed to open browser for %s: %w", path, err)
	}
	return nil
}
