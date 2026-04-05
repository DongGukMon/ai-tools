package main

import (
	"flag"
	"fmt"
	"io"
	"os"
	"strconv"
	"strings"

	"github.com/bang9/ai-tools/pipemd/internal/pipemd"
	"golang.org/x/term"
)

var version = "dev"

func main() {
	os.Exit(run())
}

func run() int {
	var (
		width            = flag.Int("width", 0, "render width in columns (default: stdout width or $COLUMNS)")
		widthShort       = flag.Int("w", 0, "render width in columns (shorthand)")
		colorMode        = flag.String("color", "auto", "ANSI color mode: auto, always, never")
		noHighlight      = flag.Bool("no-highlight", false, "disable fenced code syntax highlighting")
		showVersion      = flag.Bool("version", false, "print version")
		showVersionShort = flag.Bool("V", false, "print version (shorthand)")
	)
	flag.Usage = func() {
		fmt.Fprintf(flag.CommandLine.Output(), "Usage: %s [flags] [file ...]\n\n", os.Args[0])
		fmt.Fprintln(flag.CommandLine.Output(), "Render markdown for terminal output. Reads stdin when no file is given.")
		fmt.Fprintln(flag.CommandLine.Output(), "")
		flag.PrintDefaults()
	}
	flag.Parse()

	if *showVersion || *showVersionShort {
		fmt.Printf("pipemd %s\n", version)
		return 0
	}

	input, err := readInput(flag.Args())
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		return 1
	}

	renderWidth := *width
	if renderWidth == 0 {
		renderWidth = *widthShort
	}

	color, err := detectColor(*colorMode)
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		return 1
	}
	opts := pipemd.Options{
		Width:     detectWidth(renderWidth),
		Color:     color,
		Highlight: color && !*noHighlight,
	}

	out, err := pipemd.Render(input, opts)
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		return 1
	}

	if _, err := io.WriteString(os.Stdout, out); err != nil {
		fmt.Fprintln(os.Stderr, err)
		return 1
	}
	return 0
}

func readInput(paths []string) (string, error) {
	if len(paths) == 0 {
		if term.IsTerminal(int(os.Stdin.Fd())) {
			return "", fmt.Errorf("pipemd expects piped input or a file path")
		}
		b, err := io.ReadAll(os.Stdin)
		if err != nil {
			return "", err
		}
		return string(b), nil
	}

	parts := make([]string, 0, len(paths))
	for _, path := range paths {
		b, err := os.ReadFile(path)
		if err != nil {
			return "", err
		}
		parts = append(parts, string(b))
	}
	return strings.Join(parts, "\n\n"), nil
}

func detectWidth(explicit int) int {
	if explicit > 0 {
		return clampWidth(explicit)
	}
	if columns := os.Getenv("COLUMNS"); columns != "" {
		if v, err := strconv.Atoi(columns); err == nil && v > 0 {
			return clampWidth(v)
		}
	}
	if term.IsTerminal(int(os.Stdout.Fd())) {
		if width, _, err := term.GetSize(int(os.Stdout.Fd())); err == nil && width > 0 {
			return clampWidth(width)
		}
	}
	return 100
}

func clampWidth(width int) int {
	if width < 24 {
		return 24
	}
	return width
}

func detectColor(mode string) (bool, error) {
	switch strings.ToLower(strings.TrimSpace(mode)) {
	case "", "auto":
		if os.Getenv("NO_COLOR") != "" || os.Getenv("TERM") == "dumb" || os.Getenv("CLICOLOR") == "0" {
			return false, nil
		}
		return term.IsTerminal(int(os.Stdout.Fd())), nil
	case "always":
		return true, nil
	case "never":
		return false, nil
	default:
		return false, fmt.Errorf("invalid --color value %q (expected auto, always, or never)", mode)
	}
}
