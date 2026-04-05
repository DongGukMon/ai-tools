package pipemd

import (
	"strings"
	"unicode"

	"github.com/mattn/go-runewidth"
)

type renderToken struct {
	text    string
	style   spanStyle
	width   int
	space   bool
	newline bool
}

func tokenize(spans []span) []renderToken {
	var tokens []renderToken
	for _, sp := range spans {
		if sp.Text == "" {
			continue
		}
		if sp.Style.Code {
			tokens = append(tokens, renderToken{
				text:  sp.Text,
				style: sp.Style,
				width: displayWidth(sp.Text),
			})
			continue
		}

		var word strings.Builder
		flushWord := func() {
			if word.Len() == 0 {
				return
			}
			text := word.String()
			tokens = append(tokens, renderToken{
				text:  text,
				style: sp.Style,
				width: displayWidth(text),
			})
			word.Reset()
		}

		for _, r := range sp.Text {
			switch {
			case r == '\n':
				flushWord()
				tokens = append(tokens, renderToken{newline: true})
			case unicode.IsSpace(r):
				flushWord()
				tokens = append(tokens, renderToken{space: true})
			default:
				word.WriteRune(r)
			}
		}
		flushWord()
	}
	return tokens
}

func splitToken(token renderToken, width int) []renderToken {
	if token.width <= width || width <= 1 {
		return []renderToken{token}
	}

	var parts []renderToken
	var b strings.Builder
	partWidth := 0
	flush := func() {
		if b.Len() == 0 {
			return
		}
		text := b.String()
		parts = append(parts, renderToken{
			text:  text,
			style: token.style,
			width: partWidth,
		})
		b.Reset()
		partWidth = 0
	}

	for _, r := range token.text {
		rw := runewidth.RuneWidth(r)
		if rw == 0 {
			rw = 1
		}
		if partWidth > 0 && partWidth+rw > width {
			flush()
		}
		b.WriteRune(r)
		partWidth += rw
	}
	flush()
	return parts
}

func displayWidth(text string) int {
	return runewidth.StringWidth(text)
}
