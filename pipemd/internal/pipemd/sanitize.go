package pipemd

import (
	"strings"
	"unicode"
)

// sanitizeTerminalInput removes untrusted terminal control runes while
// preserving the whitespace needed for markdown parsing and code blocks.
func sanitizeTerminalInput(input string) string {
	return stripControlRunes(stripEscapeSequences(input))
}

func stripEscapeSequences(input string) string {
	var b strings.Builder
	b.Grow(len(input))

	for i := 0; i < len(input); {
		if input[i] != 0x1b {
			b.WriteByte(input[i])
			i++
			continue
		}

		if i+1 >= len(input) {
			break
		}

		switch input[i+1] {
		case '[':
			i += 2
			for i < len(input) {
				if input[i] >= 0x40 && input[i] <= 0x7e {
					i++
					break
				}
				i++
			}
		case ']':
			i += 2
			for i < len(input) {
				if input[i] == 0x07 {
					i++
					break
				}
				if input[i] == 0x1b && i+1 < len(input) && input[i+1] == '\\' {
					i += 2
					break
				}
				i++
			}
		default:
			i += 2
		}
	}

	return b.String()
}

func stripControlRunes(input string) string {
	return strings.Map(func(r rune) rune {
		if r == '\n' || r == '\t' {
			return r
		}
		if unicode.IsControl(r) {
			return -1
		}
		return r
	}, input)
}
