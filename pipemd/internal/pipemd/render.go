package pipemd

import (
	"bytes"
	"fmt"
	"os"
	"strings"

	"github.com/alecthomas/chroma/v2/lexers"
	"github.com/alecthomas/chroma/v2/quick"
	"github.com/alecthomas/chroma/v2/styles"
	"github.com/yuin/goldmark"
	gast "github.com/yuin/goldmark/ast"
	"github.com/yuin/goldmark/extension"
	extast "github.com/yuin/goldmark/extension/ast"
	"github.com/yuin/goldmark/text"
)

type Options struct {
	Width     int
	Color     bool
	Highlight bool
}

type renderer struct {
	source []byte
	opts   Options
}

type spanStyle struct {
	Bold      bool
	Italic    bool
	Code      bool
	Underline bool
	Dim       bool
}

type span struct {
	Text  string
	Style spanStyle
}

type wrappedLine struct {
	Text  string
	Width int
}

type tableCell struct {
	spans []span
	plain string
	align extast.Alignment
}

func Render(input string, opts Options) (string, error) {
	if opts.Width <= 0 {
		opts.Width = 100
	}
	input = repairWrappedMarkdown(input)
	input = sanitizeTerminalInput(input)

	md := goldmark.New(goldmark.WithExtensions(extension.GFM))
	src := []byte(input)
	doc := md.Parser().Parse(text.NewReader(src))

	r := renderer{
		source: src,
		opts:   opts,
	}

	lines := r.renderChildren(doc)
	if len(lines) == 0 {
		return "", nil
	}
	return strings.Join(lines, "\n") + "\n", nil
}

func (r *renderer) renderChildren(parent gast.Node) []string {
	var out []string
	for child := parent.FirstChild(); child != nil; child = child.NextSibling() {
		block := r.renderBlock(child)
		if len(block) == 0 {
			continue
		}
		if len(out) > 0 && out[len(out)-1] != "" && block[0] != "" {
			out = append(out, "")
		}
		out = append(out, block...)
	}
	return trimTrailingEmpty(out)
}

func (r *renderer) renderBlock(node gast.Node) []string {
	switch n := node.(type) {
	case *gast.Heading:
		return r.renderHeading(n)
	case *gast.Paragraph:
		return wrappedLinesToStrings(r.wrapSpans(r.inlineSpans(n, spanStyle{}), r.opts.Width))
	case *gast.TextBlock:
		return wrappedLinesToStrings(r.wrapSpans(r.inlineSpans(n, spanStyle{}), r.opts.Width))
	case *gast.List:
		return r.renderList(n)
	case *gast.Blockquote:
		return r.renderBlockquote(n)
	case *gast.FencedCodeBlock:
		return r.renderCodeBlock(string(n.Language(r.source)), string(n.Text(r.source)))
	case *gast.CodeBlock:
		return r.renderCodeBlock("", string(n.Text(r.source)))
	case *extast.Table:
		return r.renderTable(n)
	case *gast.ThematicBreak:
		return []string{strings.Repeat("─", min(r.opts.Width, 40))}
	default:
		if node.FirstChild() != nil {
			return r.renderChildren(node)
		}
	}
	return nil
}

func (r *renderer) renderHeading(node *gast.Heading) []string {
	spans := r.inlineSpans(node, spanStyle{Bold: true})
	lines := r.wrapSpans(spans, r.opts.Width)
	out := wrappedLinesToStrings(lines)
	if node.Level <= 2 {
		ruleWidth := 0
		for _, line := range lines {
			if line.Width > ruleWidth {
				ruleWidth = line.Width
			}
		}
		ruleWidth = max(3, ruleWidth)
		char := "─"
		if node.Level == 1 {
			char = "═"
		}
		out = append(out, r.styleMuted(strings.Repeat(char, min(ruleWidth, r.opts.Width))))
	}
	return out
}

func (r *renderer) renderList(list *gast.List) []string {
	var out []string
	index := list.Start
	if index == 0 {
		index = 1
	}

	for item := list.FirstChild(); item != nil; item = item.NextSibling() {
		listItem, ok := item.(*gast.ListItem)
		if !ok {
			continue
		}

		marker := "•"
		if list.IsOrdered() {
			marker = fmt.Sprintf("%d.", index)
			index++
		}

		sub := *r
		sub.opts.Width = max(12, r.opts.Width-(displayWidth(marker)+2))
		itemLines := sub.renderChildren(listItem)
		if len(itemLines) == 0 {
			itemLines = []string{""}
		}
		if len(out) > 0 && out[len(out)-1] != "" {
			out = append(out, "")
		}
		out = append(out, prefixLines(itemLines, r.styleMarker(marker)+" ", strings.Repeat(" ", displayWidth(marker)+1))...)
	}

	return trimTrailingEmpty(out)
}

func (r *renderer) renderBlockquote(quote *gast.Blockquote) []string {
	sub := *r
	sub.opts.Width = max(12, r.opts.Width-2)
	lines := sub.renderChildren(quote)
	if len(lines) == 0 {
		return nil
	}
	out := make([]string, 0, len(lines))
	for _, line := range lines {
		if line == "" {
			out = append(out, r.styleMuted("│"))
			continue
		}
		out = append(out, r.styleMuted("│ ")+line)
	}
	return out
}

func (r *renderer) renderCodeBlock(language string, code string) []string {
	code = strings.TrimRight(code, "\n")
	if code == "" {
		return nil
	}

	out := make([]string, 0, strings.Count(code, "\n")+2)
	label := "code"
	if language = strings.TrimSpace(language); language != "" {
		label = language
	}
	out = append(out, r.styleMuted("["+label+"]"))

	rendered := code
	if r.opts.Highlight {
		if highlighted, err := r.highlight(language, code); err == nil && highlighted != "" {
			rendered = strings.TrimRight(highlighted, "\n")
		}
	}

	for _, line := range strings.Split(rendered, "\n") {
		out = append(out, r.styleMuted("│ ")+line)
	}
	return out
}

func (r *renderer) renderTable(table *extast.Table) []string {
	header, rows := r.collectTable(table)
	if len(header) == 0 && len(rows) == 0 {
		return nil
	}

	colCount := 0
	if len(header) > colCount {
		colCount = len(header)
	}
	for _, row := range rows {
		if len(row) > colCount {
			colCount = len(row)
		}
	}
	if colCount == 0 {
		return nil
	}

	header = padCells(header, colCount)
	for i := range rows {
		rows[i] = padCells(rows[i], colCount)
	}

	widths := r.tableWidths(header, rows)
	out := []string{tableBorder("┌", "┬", "┐", widths)}

	if len(header) > 0 {
		out = append(out, r.renderTableRow(header, widths)...)
		out = append(out, tableBorder("├", "┼", "┤", widths))
	}

	for i, row := range rows {
		out = append(out, r.renderTableRow(row, widths)...)
		if i != len(rows)-1 {
			out = append(out, tableBorder("├", "┼", "┤", widths))
		}
	}

	out = append(out, tableBorder("└", "┴", "┘", widths))
	return out
}

func (r *renderer) renderTableRow(cells []tableCell, widths []int) []string {
	wrapped := make([][]wrappedLine, len(cells))
	height := 1
	for i, cell := range cells {
		lines := r.wrapSpans(cell.spans, widths[i])
		if len(lines) == 0 {
			lines = []wrappedLine{{}}
		}
		wrapped[i] = lines
		if len(lines) > height {
			height = len(lines)
		}
	}

	out := make([]string, 0, height)
	for lineIdx := 0; lineIdx < height; lineIdx++ {
		var b strings.Builder
		b.WriteString("│")
		for cellIdx, lines := range wrapped {
			var line wrappedLine
			if lineIdx < len(lines) {
				line = lines[lineIdx]
			}
			b.WriteString(" ")
			b.WriteString(alignLine(line, widths[cellIdx], cells[cellIdx].align))
			b.WriteString(" │")
		}
		out = append(out, b.String())
	}
	return out
}

func (r *renderer) collectTable(table *extast.Table) ([]tableCell, [][]tableCell) {
	var header []tableCell
	var rows [][]tableCell

	for child := table.FirstChild(); child != nil; child = child.NextSibling() {
		switch row := child.(type) {
		case *extast.TableHeader:
			header = r.collectCells(row, true)
		case *extast.TableRow:
			rows = append(rows, r.collectCells(row, false))
		}
	}

	return header, rows
}

func (r *renderer) collectCells(parent gast.Node, header bool) []tableCell {
	cells := []tableCell{}
	for child := parent.FirstChild(); child != nil; child = child.NextSibling() {
		cell, ok := child.(*extast.TableCell)
		if !ok {
			continue
		}
		style := spanStyle{}
		if header {
			style.Bold = true
		}
		spans := r.inlineSpans(cell, style)
		cells = append(cells, tableCell{
			spans: spans,
			plain: spansPlain(spans),
			align: cell.Alignment,
		})
	}
	return cells
}

func (r *renderer) tableWidths(header []tableCell, rows [][]tableCell) []int {
	colCount := len(header)
	if colCount == 0 && len(rows) > 0 {
		colCount = len(rows[0])
	}
	widths := make([]int, colCount)

	for i, cell := range header {
		widths[i] = max(widths[i], preferredCellWidth(cell.plain))
	}
	for _, row := range rows {
		for i, cell := range row {
			widths[i] = max(widths[i], preferredCellWidth(cell.plain))
		}
	}
	for i := range widths {
		widths[i] = max(4, widths[i])
	}

	available := r.opts.Width - (3*colCount + 1)
	if available < colCount*4 {
		available = colCount * 4
	}

	sum := 0
	for _, width := range widths {
		sum += width
	}
	for sum > available {
		idx := widestIndex(widths)
		if widths[idx] <= 4 {
			break
		}
		widths[idx]--
		sum--
	}

	return widths
}

func (r *renderer) inlineSpans(node gast.Node, style spanStyle) []span {
	var out []span
	for child := node.FirstChild(); child != nil; child = child.NextSibling() {
		switch n := child.(type) {
		case *gast.Text:
			text := string(n.Value(r.source))
			if text != "" {
				out = append(out, span{Text: text, Style: style})
			}
			if n.HardLineBreak() {
				out = append(out, span{Text: "\n", Style: style})
			} else if n.SoftLineBreak() {
				out = append(out, span{Text: " ", Style: style})
			}
		case *gast.String:
			if len(n.Value) > 0 {
				out = append(out, span{Text: string(n.Value), Style: style})
			}
		case *gast.CodeSpan:
			next := style
			next.Code = true
			out = append(out, span{Text: collectInlineText(n, r.source), Style: next})
		case *gast.Emphasis:
			next := style
			if n.Level == 1 {
				next.Italic = true
			} else {
				next.Bold = true
			}
			out = append(out, r.inlineSpans(n, next)...)
		case *gast.Link:
			next := style
			next.Underline = true
			linkSpans := r.inlineSpans(n, next)
			out = append(out, linkSpans...)
			label := strings.TrimSpace(spansPlain(linkSpans))
			url := strings.TrimSpace(string(n.Destination))
			if url != "" && url != label {
				out = append(out, span{Text: " (" + url + ")", Style: style})
			}
		case *gast.AutoLink:
			next := style
			next.Underline = true
			out = append(out, span{Text: string(n.URL(r.source)), Style: next})
		default:
			if child.FirstChild() != nil {
				out = append(out, r.inlineSpans(child, style)...)
			}
		}
	}
	return mergeSpans(out)
}

func (r *renderer) wrapSpans(spans []span, width int) []wrappedLine {
	if len(spans) == 0 {
		return []wrappedLine{{}}
	}

	tokens := tokenize(spans)
	if len(tokens) == 0 {
		return []wrappedLine{{}}
	}

	var lines []wrappedLine
	var b strings.Builder
	lineWidth := 0
	pendingSpace := false

	flush := func() {
		lines = append(lines, wrappedLine{Text: b.String(), Width: lineWidth})
		b.Reset()
		lineWidth = 0
		pendingSpace = false
	}

	for _, token := range tokens {
		switch {
		case token.newline:
			flush()
		case token.space:
			if lineWidth > 0 {
				pendingSpace = true
			}
		default:
			parts := []renderToken{token}
			if token.width > width {
				parts = splitToken(token, width)
			}
			for _, part := range parts {
				if pendingSpace && lineWidth > 0 {
					if lineWidth+1+part.width > width {
						flush()
					} else {
						b.WriteByte(' ')
						lineWidth++
					}
				}
				if lineWidth > 0 && lineWidth+part.width > width {
					flush()
				}
				b.WriteString(styleText(part.text, part.style, r.opts.Color))
				lineWidth += part.width
				pendingSpace = false
			}
		}
	}

	if b.Len() > 0 || len(lines) == 0 {
		flush()
	}

	return lines
}

func (r *renderer) highlight(language string, code string) (string, error) {
	formatterName := "terminal256"
	if strings.Contains(strings.ToLower(strings.TrimSpace(os.Getenv("COLORTERM"))), "truecolor") {
		formatterName = "terminal16m"
	}

	styleName := "monokai"
	if styles.Get(styleName) == nil {
		styleName = "swapoff"
	}

	lexerName := strings.TrimSpace(language)
	if lexerName == "" {
		if lexer := lexers.Analyse(code); lexer != nil {
			lexerName = lexer.Config().Name
		}
	}
	if lexerName == "" {
		lexerName = "plaintext"
	}

	var buf bytes.Buffer
	if err := quick.Highlight(&buf, code, lexerName, formatterName, styleName); err != nil {
		return "", err
	}
	return buf.String(), nil
}
