package main

import (
	"flag"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strconv"
	"strings"

	"github.com/bang9/ai-tools/pipemd/internal/pipemd"
	"github.com/bang9/ai-tools/shared/upgrade"
	"golang.org/x/term"
)

var version = "dev"

func main() {
	os.Exit(run())
}

func run() int {
	if len(os.Args) > 1 {
		switch os.Args[1] {
		case "version":
			fmt.Printf("pipemd %s\n", version)
			return 0
		case "upgrade", "update":
			if len(os.Args) != 2 {
				fmt.Fprintln(os.Stderr, "pipemd upgrade does not accept additional arguments")
				return 1
			}
			if err := upgrade.Run(upgrade.Config{
				Repo:       "bang9/ai-tools",
				BinaryName: "pipemd",
				Version:    version,
			}); err != nil {
				fmt.Fprintf(os.Stderr, "error: %v\n", err)
				return 1
			}
			return 0
		case "--help", "-h", "help":
			return runRender([]string{"--help"})
		}
	}

	return runRender(os.Args[1:])
}

func runRender(args []string) int {
	fs := flag.NewFlagSet("pipemd", flag.ContinueOnError)
	fs.SetOutput(os.Stderr)
	var (
		width            = fs.Int("width", 0, "render width in columns (default: stdout width or $COLUMNS)")
		widthShort       = fs.Int("w", 0, "render width in columns (shorthand)")
		colorMode        = fs.String("color", "always", "ANSI color mode: auto, always, never")
		noHighlight      = fs.Bool("no-highlight", false, "disable fenced code syntax highlighting")
		showVersion      = fs.Bool("version", false, "print version")
		showVersionShort = fs.Bool("V", false, "print version (shorthand)")
	)
	fs.Usage = func() {
		printUsage(fs.Output())
		fmt.Fprintln(fs.Output(), "")
		fmt.Fprintln(fs.Output(), "Render flags:")
		fs.PrintDefaults()
	}
	if err := fs.Parse(args); err != nil {
		if err == flag.ErrHelp {
			return 0
		}
		return 1
	}

	if *showVersion || *showVersionShort {
		fmt.Printf("pipemd %s\n", version)
		return 0
	}

	input, err := readInput(fs.Args())
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

func printUsage(w io.Writer) {
	name := commandName()
	fmt.Fprintf(w, "Usage:\n")
	fmt.Fprintf(w, "  %s [flags] [file ...]\n", name)
	fmt.Fprintf(w, "  %s version\n", name)
	fmt.Fprintf(w, "  %s upgrade\n", name)
	fmt.Fprintf(w, "  %s update\n", name)
	fmt.Fprintln(w, "")
	fmt.Fprintln(w, "Render markdown for terminal output. Reads stdin when no file is given.")
}

func commandName() string {
	name := filepath.Base(os.Args[0])
	if name == "" {
		return "pipemd"
	}
	return name
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
