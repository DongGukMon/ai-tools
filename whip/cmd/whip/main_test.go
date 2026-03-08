package main

import (
	"bytes"
	"testing"
)

func TestHelloCmd(t *testing.T) {
	root := newRootCmd()
	var stdout bytes.Buffer
	root.SetOut(&stdout)
	root.SetErr(&stdout)
	root.SetArgs([]string{"hello"})

	if err := root.Execute(); err != nil {
		t.Fatalf("Execute: %v", err)
	}

	if got := stdout.String(); got != "hello world\n" {
		t.Fatalf("stdout = %q, want %q", got, "hello world\n")
	}
}
