package pipemd

import (
	"strings"
	"unicode"
	"unicode/utf8"
)

func repairWrappedMarkdown(input string) string {
	input = strings.ReplaceAll(input, "\r\n", "\n")
	input = strings.ReplaceAll(input, "\r", "\n")

	lines := strings.Split(input, "\n")
	var out []string
	var block []string
	inFence := false

	flushBlock := func() {
		if len(block) == 0 {
			return
		}
		out = append(out, repairBlock(block)...)
		block = nil
	}

	for _, line := range lines {
		trimmed := strings.TrimSpace(line)
		if isFenceLine(trimmed) {
			flushBlock()
			out = append(out, line)
			inFence = !inFence
			continue
		}
		if inFence {
			out = append(out, line)
			continue
		}
		if trimmed == "" {
			flushBlock()
			if len(out) == 0 || out[len(out)-1] != "" {
				out = append(out, "")
			}
			continue
		}
		block = append(block, line)
	}
	flushBlock()

	for len(out) > 0 && out[len(out)-1] == "" {
		out = out[:len(out)-1]
	}
	return strings.Join(out, "\n")
}

func repairBlock(lines []string) []string {
	if looksLikeTable(lines) {
		return repairTableBlock(lines)
	}
	return repairTextBlock(lines)
}

func repairTableBlock(lines []string) []string {
	var rows []string
	current := ""

	for _, line := range lines {
		trimmed := strings.TrimSpace(line)
		if trimmed == "" {
			continue
		}
		if isTableRowLine(trimmed) {
			if current != "" {
				rows = append(rows, current)
			}
			current = trimmed
			continue
		}
		if current == "" {
			current = trimmed
			continue
		}
		current = smartJoin(current, line)
	}

	if current != "" {
		rows = append(rows, current)
	}
	return rows
}

func repairTextBlock(lines []string) []string {
	var out []string
	current := ""

	flush := func() {
		if current == "" {
			return
		}
		out = append(out, current)
		current = ""
	}

	for _, line := range lines {
		trimmed := strings.TrimSpace(line)
		if trimmed == "" {
			continue
		}
		if current == "" {
			current = trimmed
			continue
		}
		if isStandaloneStarter(trimmed) {
			flush()
			current = trimmed
			continue
		}
		current = smartJoin(current, line)
	}
	flush()
	return out
}

func looksLikeTable(lines []string) bool {
	hasSeparator := false
	hasRow := false
	for _, line := range lines {
		trimmed := strings.TrimSpace(line)
		if isTableSeparatorLine(trimmed) {
			hasSeparator = true
			continue
		}
		if isTableRowLine(trimmed) {
			hasRow = true
		}
	}
	return hasSeparator && hasRow
}

func isTableRowLine(line string) bool {
	line = strings.TrimSpace(line)
	return strings.HasPrefix(line, "|") && strings.Count(line, "|") >= 2
}

func isTableSeparatorLine(line string) bool {
	line = strings.TrimSpace(line)
	if !strings.HasPrefix(line, "|") {
		return false
	}
	parts := strings.Split(strings.Trim(line, "| "), "|")
	if len(parts) == 0 {
		return false
	}
	for _, part := range parts {
		part = strings.TrimSpace(part)
		if part == "" {
			return false
		}
		for _, r := range part {
			if r != '-' && r != ':' {
				return false
			}
		}
	}
	return true
}

func isFenceLine(line string) bool {
	return strings.HasPrefix(line, "```") || strings.HasPrefix(line, "~~~")
}

func isStandaloneStarter(line string) bool {
	if line == "" {
		return false
	}
	if strings.HasPrefix(line, "#") || strings.HasPrefix(line, ">") || strings.HasPrefix(line, "• ") {
		return true
	}
	if isFenceLine(line) || isThematicBreak(line) || isListMarker(line) {
		return true
	}
	return false
}

func isThematicBreak(line string) bool {
	line = strings.TrimSpace(line)
	if len(line) < 3 {
		return false
	}
	if strings.Trim(line, "-") == "" || strings.Trim(line, "*") == "" || strings.Trim(line, "_") == "" {
		return true
	}
	return false
}

func isListMarker(line string) bool {
	if len(line) < 2 {
		return false
	}
	if (line[0] == '-' || line[0] == '+' || line[0] == '*') && unicode.IsSpace(rune(line[1])) {
		return true
	}
	i := 0
	for i < len(line) && line[i] >= '0' && line[i] <= '9' {
		i++
	}
	if i == 0 || i+1 >= len(line) {
		return false
	}
	if (line[i] == '.' || line[i] == ')') && unicode.IsSpace(rune(line[i+1])) {
		return true
	}
	return false
}

func smartJoin(prev string, next string) string {
	indent := len(next) - len(strings.TrimLeft(next, " \t"))
	prev = strings.TrimRight(prev, " \t")
	next = strings.TrimLeft(next, " \t")
	if prev == "" {
		return next
	}
	if next == "" {
		return prev
	}

	last, _ := utf8.DecodeLastRuneInString(prev)
	first, _ := utf8.DecodeRuneInString(next)
	if shouldAddSpace(last, first, next, indent) {
		return prev + " " + next
	}
	return prev + next
}

func shouldAddSpace(last rune, first rune, next string, indent int) bool {
	if last == utf8.RuneError || first == utf8.RuneError {
		return false
	}
	if strings.ContainsRune("([{\"'`/:-", last) {
		return false
	}
	if strings.ContainsRune(".,;:!?)]}\"'%/|", first) {
		return false
	}
	if strings.ContainsRune(",;:!?→", last) {
		return true
	}
	if isHangul(last) && isHangul(first) {
		token := leadingHangulToken(next)
		if indent == 0 {
			return false
		}
		if token == "" {
			return false
		}
		if hasHangulAttachPrefix(token) {
			return false
		}
		return true
	}
	if isCJK(last) && isCJK(first) {
		return false
	}
	if isLatinOrDigit(last) && isLatinOrDigit(first) {
		return true
	}
	if (isHangul(last) || isCJK(last)) && isLatinOrDigit(first) {
		return true
	}
	if isLatinOrDigit(last) && (isHangul(first) || isCJK(first)) {
		return false
	}
	return false
}

func isLatinOrDigit(r rune) bool {
	return unicode.In(r, unicode.Latin) || unicode.IsDigit(r)
}

func isHangul(r rune) bool {
	return unicode.In(r, unicode.Hangul)
}

func isCJK(r rune) bool {
	return unicode.In(r, unicode.Han, unicode.Hiragana, unicode.Katakana)
}

func leadingHangulToken(s string) string {
	var token []rune
	for _, r := range s {
		if !isHangul(r) {
			break
		}
		token = append(token, r)
	}
	return string(token)
}

func hasHangulAttachPrefix(token string) bool {
	prefixes := []string{
		"니다", "습니다", "처럼", "보다", "보다는", "으로", "에서", "에게",
		"부터", "까지", "이며", "이고", "인데", "하는", "하며", "하면",
		"해서", "되고", "되는", "됐다", "되어", "라고", "이라", "인",
	}
	for _, prefix := range prefixes {
		if strings.HasPrefix(token, prefix) {
			return true
		}
	}
	return false
}
