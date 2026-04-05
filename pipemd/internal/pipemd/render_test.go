package pipemd

import (
	"strings"
	"testing"
)

func TestRenderTableUsesBoxDrawing(t *testing.T) {
	input := "| Col A | Col B |\n|---|---|\n| short | a much longer cell that should wrap |\n"

	out, err := Render(input, Options{Width: 36, Color: false, Highlight: false})
	if err != nil {
		t.Fatalf("Render returned error: %v", err)
	}

	for _, want := range []string{
		"┌",
		"┬",
		"┼",
		"└",
		"│ Col A",
		"wrap",
	} {
		if !strings.Contains(out, want) {
			t.Fatalf("expected %q in output:\n%s", want, out)
		}
	}
}

func TestRenderInlineStylesEmitANSI(t *testing.T) {
	input := "**bold** *italic* ***both*** `code`"

	out, err := Render(input, Options{Width: 80, Color: true, Highlight: false})
	if err != nil {
		t.Fatalf("Render returned error: %v", err)
	}

	if !strings.Contains(out, "\x1b[1m") {
		t.Fatalf("expected bold ANSI sequence in output: %q", out)
	}
	if !strings.Contains(out, "\x1b[3m") {
		t.Fatalf("expected italic ANSI sequence in output: %q", out)
	}
	if !strings.Contains(out, "code") {
		t.Fatalf("expected inline code text in output: %q", out)
	}
}

func TestRenderCodeBlockPlain(t *testing.T) {
	input := "```go\nfmt.Println(\"hi\")\n```\n"

	out, err := Render(input, Options{Width: 80, Color: false, Highlight: false})
	if err != nil {
		t.Fatalf("Render returned error: %v", err)
	}

	for _, want := range []string{
		"[go]",
		"│ fmt.Println(\"hi\")",
	} {
		if !strings.Contains(out, want) {
			t.Fatalf("expected %q in output:\n%s", want, out)
		}
	}
}

func TestRepairWrappedMarkdownRepairsParagraphsAndTables(t *testing.T) {
	input := "• general-purpose wiki보다 도메인 특화 knowledge\n  compiler에 더 가깝습니다.\n\n| 축 | 현재 레포 |\n|---|---|\n| 핵심 산출물 | knowledge를 핵심 산출물로 둡\n  니다. README.md:7 |\n| 시스템의 중심 | 수집 → facts →\n  knowledge → answer |\n\n위키 기반 지식 운영체제\n보다는 배치형 memory pipeline입니다.\n"

	got := repairWrappedMarkdown(input)

	for _, want := range []string{
		"• general-purpose wiki보다 도메인 특화 knowledge compiler에 더 가깝습니다.",
		"| 핵심 산출물 | knowledge를 핵심 산출물로 둡니다. README.md:7 |",
		"| 시스템의 중심 | 수집 → facts → knowledge → answer |",
		"위키 기반 지식 운영체제보다는 배치형 memory pipeline입니다.",
	} {
		if !strings.Contains(got, want) {
			t.Fatalf("expected repaired markdown to contain %q, got:\n%s", want, got)
		}
	}
}

func TestRenderStripsTerminalControlSequencesFromProse(t *testing.T) {
	input := "hello \x1b]0;spoof\x07world \x1b[31mred\x1b[0m text"

	out, err := Render(input, Options{Width: 80, Color: false, Highlight: false})
	if err != nil {
		t.Fatalf("Render returned error: %v", err)
	}

	if strings.Contains(out, "\x1b") || strings.Contains(out, "\x07") {
		t.Fatalf("expected control characters to be stripped, got %q", out)
	}
	for _, want := range []string{"hello", "world", "red", "text"} {
		if !strings.Contains(out, want) {
			t.Fatalf("expected %q in output: %q", want, out)
		}
	}
}

func TestRenderStripsTerminalControlSequencesFromCodeBlocks(t *testing.T) {
	input := "```text\nsafe\x1b]52;c;evil\x07code\x1b[31mhere\x1b[0m\n```\n"

	out, err := Render(input, Options{Width: 80, Color: false, Highlight: false})
	if err != nil {
		t.Fatalf("Render returned error: %v", err)
	}

	if strings.Contains(out, "\x1b") || strings.Contains(out, "\x07") {
		t.Fatalf("expected control characters to be stripped, got %q", out)
	}
	if !strings.Contains(out, "safecodehere") {
		t.Fatalf("expected sanitized code content in output: %q", out)
	}
}
