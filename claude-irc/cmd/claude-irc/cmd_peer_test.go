package main

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/bang9/ai-tools/claude-irc/internal/irc"
)

func TestResolveMyName_NoFallbackToSinglePeer(t *testing.T) {
	origDetect := detectSession
	detectSession = noSessionDetect
	defer func() { detectSession = origDetect }()

	tmpDir := t.TempDir()
	store, err := irc.NewStoreWithBaseDir(tmpDir)
	if err != nil {
		t.Fatal(err)
	}

	if err := store.Register("whip-master", os.Getpid()); err != nil {
		t.Fatal(err)
	}

	nameFlag = ""

	_, err = resolveMyName(store)
	if err == nil {
		t.Fatal("resolveMyName should have returned error when no session marker exists, even with 1 peer registered")
	}
}

func TestResolveMyName_NameUserAllowedWithoutSession(t *testing.T) {
	origDetect := detectSession
	detectSession = noSessionDetect
	defer func() { detectSession = origDetect }()

	tmpDir := t.TempDir()
	store, err := irc.NewStoreWithBaseDir(tmpDir)
	if err != nil {
		t.Fatal(err)
	}

	nameFlag = "user"
	defer func() { nameFlag = "" }()

	name, err := resolveMyName(store)
	if err != nil {
		t.Fatalf("resolveMyName with --name user should succeed: %v", err)
	}
	if name != "user" {
		t.Fatalf("expected 'user', got '%s'", name)
	}
}

func TestResolveMyName_NameNonUserRejectedWithoutSession(t *testing.T) {
	origDetect := detectSession
	detectSession = noSessionDetect
	defer func() { detectSession = origDetect }()

	tmpDir := t.TempDir()
	store, err := irc.NewStoreWithBaseDir(tmpDir)
	if err != nil {
		t.Fatal(err)
	}

	nameFlag = "fake-agent"
	defer func() { nameFlag = "" }()

	_, err = resolveMyName(store)
	if err == nil {
		t.Fatal("resolveMyName with --name fake-agent should fail without active session")
	}
	if !strings.Contains(err.Error(), "not allowed without an active session") {
		t.Fatalf("unexpected error message: %v", err)
	}
}

func TestMsgCmd_SendToUserWhenRegistered(t *testing.T) {
	origDetect := detectSession
	defer func() { detectSession = origDetect }()

	tmpHome := t.TempDir()
	t.Setenv("HOME", tmpHome)

	store, err := irc.NewStoreWithBaseDir(filepath.Join(tmpHome, ".claude-irc"))
	if err != nil {
		t.Fatal(err)
	}
	if err := store.Register("agent-1", os.Getpid()); err != nil {
		t.Fatal(err)
	}
	if err := store.Register("user", os.Getpid()); err != nil {
		t.Fatal(err)
	}

	detectSession = func(pid int) (*irc.Store, string, error) {
		return store, "agent-1", nil
	}

	nameFlag = ""

	cmd := msgCmd()
	if err := cmd.RunE(cmd, []string{"user", "reply"}); err != nil {
		t.Fatalf("msgCmd should allow sending to user: %v", err)
	}

	messages, err := store.ReadInbox("user")
	if err != nil {
		t.Fatalf("failed to read user inbox: %v", err)
	}
	if len(messages) != 1 {
		t.Fatalf("expected 1 message, got %d", len(messages))
	}
	if messages[0].From != "agent-1" {
		t.Fatalf("expected message from 'agent-1', got %q", messages[0].From)
	}
	if messages[0].Content != "reply" {
		t.Fatalf("expected message content 'reply', got %q", messages[0].Content)
	}
}

func TestMsgCmd_SendToUserWithoutRegistration(t *testing.T) {
	origDetect := detectSession
	defer func() { detectSession = origDetect }()

	tmpHome := t.TempDir()
	t.Setenv("HOME", tmpHome)

	store, err := irc.NewStoreWithBaseDir(filepath.Join(tmpHome, ".claude-irc"))
	if err != nil {
		t.Fatal(err)
	}
	if err := store.Register("agent-1", os.Getpid()); err != nil {
		t.Fatal(err)
	}

	detectSession = func(pid int) (*irc.Store, string, error) {
		return store, "agent-1", nil
	}

	nameFlag = ""

	cmd := msgCmd()
	if err := cmd.RunE(cmd, []string{"user", "reply"}); err != nil {
		t.Fatalf("msgCmd should allow sending to virtual user inbox: %v", err)
	}

	messages, err := store.ReadInbox("user")
	if err != nil {
		t.Fatalf("failed to read user inbox: %v", err)
	}
	if len(messages) != 1 {
		t.Fatalf("expected 1 message, got %d", len(messages))
	}
	if messages[0].From != "agent-1" {
		t.Fatalf("expected message from 'agent-1', got %q", messages[0].From)
	}
	if messages[0].Content != "reply" {
		t.Fatalf("expected message content 'reply', got %q", messages[0].Content)
	}
}

func TestMsgCmd_UserCanSend(t *testing.T) {
	origDetect := detectSession
	detectSession = noSessionDetect
	defer func() { detectSession = origDetect }()

	tmpDir := t.TempDir()
	store, err := irc.NewStoreWithBaseDir(tmpDir)
	if err != nil {
		t.Fatal(err)
	}

	if err := store.Register("agent-1", os.Getpid()); err != nil {
		t.Fatal(err)
	}

	nameFlag = "user"
	defer func() { nameFlag = "" }()

	from, err := resolveMyName(store)
	if err != nil {
		t.Fatalf("resolveMyName as user should succeed: %v", err)
	}
	if from != "user" {
		t.Fatalf("expected 'user', got '%s'", from)
	}

	if err := store.SendMessage("agent-1", from, "hello from observer"); err != nil {
		t.Fatalf("user should be able to send messages: %v", err)
	}

	messages, err := store.ReadInbox("agent-1")
	if err != nil {
		t.Fatalf("failed to read inbox: %v", err)
	}
	if len(messages) != 1 {
		t.Fatalf("expected 1 message, got %d", len(messages))
	}
	if messages[0].From != "user" {
		t.Fatalf("expected message from 'user', got '%s'", messages[0].From)
	}
	if messages[0].Content != "hello from observer" {
		t.Fatalf("unexpected message content: %s", messages[0].Content)
	}
}
