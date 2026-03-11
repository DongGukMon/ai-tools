package viewer

import (
	"strings"
	"testing"
)

func TestDetectFormat(t *testing.T) {
	tests := []struct {
		input string
		want  string
	}{
		{`{"key": "val"}`, "json"},
		{`[1, 2, 3]`, "json"},
		{`  {"key": "val"}`, "json"},
		{`# Hello`, "md"},
		{`plain text`, "md"},
		{``, "md"},
	}

	for _, tt := range tests {
		got := DetectFormat(tt.input)
		if got != tt.want {
			t.Errorf("DetectFormat(%q) = %q, want %q", tt.input, got, tt.want)
		}
	}
}

func TestRenderMarkdown(t *testing.T) {
	tests := []struct {
		name     string
		input    string
		contains []string
	}{
		{
			name:     "heading",
			input:    "# Hello",
			contains: []string{"<h1>Hello</h1>"},
		},
		{
			name:     "paragraph",
			input:    "Hello world",
			contains: []string{"<p>Hello world</p>"},
		},
		{
			name:  "GFM table",
			input: "| A | B |\n|---|---|\n| 1 | 2 |",
			contains: []string{
				"<table>",
				"<th>A</th>",
				"<td>1</td>",
			},
		},
		{
			name:     "strikethrough",
			input:    "~~deleted~~",
			contains: []string{"<del>deleted</del>"},
		},
		{
			name:     "autolink",
			input:    "Visit https://example.com",
			contains: []string{"<a href=\"https://example.com\""},
		},
		{
			name:  "task list",
			input: "- [x] Done\n- [ ] Todo",
			contains: []string{
				"checked",
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := RenderMarkdown(tt.input)
			for _, want := range tt.contains {
				if !strings.Contains(result, want) {
					t.Errorf("RenderMarkdown(%q) = %q, missing %q", tt.input, result, want)
				}
			}
		})
	}
}

func TestRenderJSON(t *testing.T) {
	tests := []struct {
		name     string
		input    string
		contains []string
	}{
		{
			name:     "valid JSON object",
			input:    `{"a":1,"b":"hello"}`,
			contains: []string{"<pre>", "lang-json", "&#34;a&#34;: 1"},
		},
		{
			name:     "valid JSON array",
			input:    `[1,2,3]`,
			contains: []string{"<pre>", "[\n"},
		},
		{
			name:     "invalid JSON",
			input:    `not json`,
			contains: []string{"<pre>", "not json"},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := RenderJSON(tt.input)
			for _, want := range tt.contains {
				if !strings.Contains(result, want) {
					t.Errorf("RenderJSON(%q) = %q, missing %q", tt.input, result, want)
				}
			}
		})
	}
}

func TestRenderCode(t *testing.T) {
	result := RenderCode("func main() {}", "go")
	if !strings.Contains(result, "class=\"lang-go\"") {
		t.Errorf("expected lang-go class, got %q", result)
	}
	if !strings.Contains(result, "func main()") {
		t.Errorf("expected code content, got %q", result)
	}

	// Without lang
	result2 := RenderCode("hello", "")
	if !strings.Contains(result2, "class=\"lang-text\"") {
		t.Errorf("expected lang-text class for empty lang, got %q", result2)
	}
}

func TestRenderText(t *testing.T) {
	result := RenderText("plain text\nline 2")
	if !strings.Contains(result, "<pre class=\"viewer-text\">") {
		t.Errorf("expected viewer-text class, got %q", result)
	}
	if !strings.Contains(result, "plain text") {
		t.Errorf("expected content, got %q", result)
	}
}

func TestRenderCode_HTMLEscape(t *testing.T) {
	result := RenderCode("<script>alert('xss')</script>", "html")
	if strings.Contains(result, "<script>") {
		t.Error("RenderCode should escape HTML entities")
	}
	if !strings.Contains(result, "&lt;script&gt;") {
		t.Errorf("expected escaped HTML, got %q", result)
	}
}

func TestRender_AutoDetect(t *testing.T) {
	// JSON auto-detect
	result := Render(`{"a":1}`, "")
	if !strings.Contains(result, "lang-json") {
		t.Errorf("expected JSON rendering for auto-detect, got %q", result)
	}

	// Markdown auto-detect
	result2 := Render("# Hello", "")
	if !strings.Contains(result2, "<h1>") {
		t.Errorf("expected markdown rendering for auto-detect, got %q", result2)
	}
}

func TestRender_ExplicitFormat(t *testing.T) {
	// Force text format on markdown content
	result := Render("# Hello", "text")
	if !strings.Contains(result, "viewer-text") {
		t.Errorf("expected text rendering, got %q", result)
	}

	// HTML passthrough
	result2 := Render("<div>hello</div>", "html")
	if result2 != "<div>hello</div>" {
		t.Errorf("expected HTML passthrough, got %q", result2)
	}
}
