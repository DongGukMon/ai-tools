package pipemd

import (
	"strings"

	gast "github.com/yuin/goldmark/ast"
	extast "github.com/yuin/goldmark/extension/ast"
)

func styleText(text string, style spanStyle, color bool) string {
	if text == "" || !color {
		return text
	}

	codes := make([]string, 0, 5)
	if style.Bold {
		codes = append(codes, "1")
	}
	if style.Dim {
		codes = append(codes, "2")
	}
	if style.Italic {
		codes = append(codes, "3")
	}
	if style.Underline {
		codes = append(codes, "4")
	}
	if style.Code {
		codes = append(codes, "38;5;223", "48;5;236")
	}
	if len(codes) == 0 {
		return text
	}

	var b strings.Builder
	b.WriteString("\x1b[")
	b.WriteString(strings.Join(codes, ";"))
	b.WriteByte('m')
	b.WriteString(text)
	b.WriteString("\x1b[0m")
	return b.String()
}

func (r *renderer) styleMuted(text string) string {
	return styleText(text, spanStyle{Dim: true}, r.opts.Color)
}

func (r *renderer) styleMarker(text string) string {
	return styleText(text, spanStyle{Bold: true}, r.opts.Color)
}

func tableBorder(left string, mid string, right string, widths []int) string {
	var b strings.Builder
	b.WriteString(left)
	for i, width := range widths {
		b.WriteString(strings.Repeat("─", width+2))
		if i == len(widths)-1 {
			b.WriteString(right)
		} else {
			b.WriteString(mid)
		}
	}
	return b.String()
}

func alignLine(line wrappedLine, width int, align extast.Alignment) string {
	if line.Width >= width {
		return line.Text + strings.Repeat(" ", max(0, width-line.Width))
	}
	diff := width - line.Width
	switch align {
	case extast.AlignRight:
		return strings.Repeat(" ", diff) + line.Text
	case extast.AlignCenter:
		left := diff / 2
		right := diff - left
		return strings.Repeat(" ", left) + line.Text + strings.Repeat(" ", right)
	default:
		return line.Text + strings.Repeat(" ", diff)
	}
}

func preferredCellWidth(plain string) int {
	maxWidth := 0
	for _, line := range strings.Split(strings.TrimSpace(plain), "\n") {
		maxWidth = max(maxWidth, displayWidth(strings.TrimSpace(line)))
	}
	if maxWidth == 0 {
		return 4
	}
	return min(maxWidth, 40)
}

func widestIndex(widths []int) int {
	idx := 0
	for i := 1; i < len(widths); i++ {
		if widths[i] > widths[idx] {
			idx = i
		}
	}
	return idx
}

func trimTrailingEmpty(lines []string) []string {
	for len(lines) > 0 && lines[len(lines)-1] == "" {
		lines = lines[:len(lines)-1]
	}
	return lines
}

func wrappedLinesToStrings(lines []wrappedLine) []string {
	out := make([]string, len(lines))
	for i, line := range lines {
		out[i] = line.Text
	}
	return out
}

func spansPlain(spans []span) string {
	var b strings.Builder
	for _, span := range spans {
		b.WriteString(span.Text)
	}
	return b.String()
}

func mergeSpans(spans []span) []span {
	if len(spans) == 0 {
		return nil
	}
	merged := []span{spans[0]}
	for _, current := range spans[1:] {
		last := &merged[len(merged)-1]
		if last.Style == current.Style && current.Text != "" {
			last.Text += current.Text
			continue
		}
		merged = append(merged, current)
	}
	return merged
}

func prefixLines(lines []string, firstPrefix string, restPrefix string) []string {
	if len(lines) == 0 {
		return nil
	}
	out := make([]string, 0, len(lines))
	for i, line := range lines {
		prefix := restPrefix
		if i == 0 {
			prefix = firstPrefix
		}
		out = append(out, prefix+line)
	}
	return out
}

func padCells(cells []tableCell, count int) []tableCell {
	if len(cells) >= count {
		return cells
	}
	out := make([]tableCell, count)
	copy(out, cells)
	for i := len(cells); i < count; i++ {
		out[i] = tableCell{
			spans: []span{{Text: ""}},
			align: extast.AlignLeft,
		}
	}
	return out
}

func collectInlineText(node gast.Node, source []byte) string {
	var b strings.Builder
	for child := node.FirstChild(); child != nil; child = child.NextSibling() {
		switch n := child.(type) {
		case *gast.Text:
			b.Write(n.Value(source))
			if n.HardLineBreak() {
				b.WriteByte('\n')
			} else if n.SoftLineBreak() {
				b.WriteByte(' ')
			}
		case *gast.String:
			b.Write(n.Value)
		default:
			if child.FirstChild() != nil {
				b.WriteString(collectInlineText(child, source))
			}
		}
	}
	return b.String()
}

func min(a int, b int) int {
	if a < b {
		return a
	}
	return b
}

func max(a int, b int) int {
	if a > b {
		return a
	}
	return b
}
