package viewer

import (
	"bytes"
	"encoding/json"
	gohtml "html"
	"strings"

	"github.com/yuin/goldmark"
	"github.com/yuin/goldmark/extension"
	gmhtml "github.com/yuin/goldmark/renderer/html"
)

// DetectFormat inspects content and returns "json" if it looks like JSON,
// otherwise "md" for markdown.
func DetectFormat(content string) string {
	trimmed := strings.TrimSpace(content)
	if len(trimmed) > 0 && (trimmed[0] == '{' || trimmed[0] == '[') {
		return "json"
	}
	return "md"
}

// RenderMarkdown converts markdown content to HTML using goldmark with GFM extensions.
func RenderMarkdown(content string) string {
	md := goldmark.New(
		goldmark.WithExtensions(extension.GFM),
		goldmark.WithRendererOptions(
			gmhtml.WithUnsafe(),
		),
	)
	var buf bytes.Buffer
	if err := md.Convert([]byte(content), &buf); err != nil {
		return "<pre>" + htmlEscape(content) + "</pre>"
	}
	return buf.String()
}

// RenderJSON pretty-prints JSON content and wraps it in a code block.
func RenderJSON(content string) string {
	trimmed := strings.TrimSpace(content)
	var pretty bytes.Buffer
	if err := json.Indent(&pretty, []byte(trimmed), "", "  "); err != nil {
		// If it's not valid JSON, just show it as-is
		return "<pre><code class=\"lang-json\">" + htmlEscape(trimmed) + "</code></pre>"
	}
	return "<pre><code class=\"lang-json\">" + htmlEscape(pretty.String()) + "</code></pre>"
}

// RenderCode wraps content in a code block with an optional language class.
func RenderCode(content string, lang string) string {
	cls := "lang-text"
	if lang != "" {
		cls = "lang-" + htmlEscape(lang)
	}
	return "<pre><code class=\"" + cls + "\">" + htmlEscape(content) + "</code></pre>"
}

// RenderText wraps plain text in a preformatted block.
func RenderText(content string) string {
	return "<pre class=\"viewer-text\">" + htmlEscape(content) + "</pre>"
}

// Render dispatches to the appropriate renderer based on format.
// If format is empty, it auto-detects using DetectFormat.
func Render(content string, format string) string {
	if format == "" {
		format = DetectFormat(content)
	}
	switch format {
	case "json":
		return RenderJSON(content)
	case "md":
		return RenderMarkdown(content)
	case "text":
		return RenderText(content)
	case "html":
		return content
	default:
		return RenderMarkdown(content)
	}
}

func htmlEscape(s string) string {
	return gohtml.EscapeString(s)
}
