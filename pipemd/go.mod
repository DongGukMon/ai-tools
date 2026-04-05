module github.com/bang9/ai-tools/pipemd

go 1.26

require (
	github.com/alecthomas/chroma/v2 v2.20.0
	github.com/bang9/ai-tools/shared/upgrade v0.0.0
	github.com/mattn/go-runewidth v0.0.16
	github.com/yuin/goldmark v1.7.16
	golang.org/x/term v0.30.0
)

require (
	github.com/dlclark/regexp2 v1.11.5 // indirect
	github.com/rivo/uniseg v0.2.0 // indirect
	golang.org/x/sys v0.31.0 // indirect
)

replace github.com/bang9/ai-tools/shared/upgrade => ../shared/upgrade
