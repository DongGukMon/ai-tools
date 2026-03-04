package irc

import (
	"testing"
	"time"
)

func TestPublishAndListTopics(t *testing.T) {
	store := newTestStore(t)

	if err := store.PublishTopic("server", "API v1", "POST /api/users"); err != nil {
		t.Fatalf("PublishTopic failed: %v", err)
	}

	topics, err := store.ListTopics("server")
	if err != nil {
		t.Fatalf("ListTopics failed: %v", err)
	}

	if len(topics) != 1 {
		t.Fatalf("expected 1 topic, got %d", len(topics))
	}

	if topics[0].Title != "API v1" {
		t.Errorf("expected title 'API v1', got '%s'", topics[0].Title)
	}
	if topics[0].Content != "POST /api/users" {
		t.Errorf("expected content 'POST /api/users', got '%s'", topics[0].Content)
	}
}

func TestGetTopicByIndex(t *testing.T) {
	store := newTestStore(t)

	store.PublishTopic("server", "First", "content1")
	time.Sleep(10 * time.Millisecond)
	store.PublishTopic("server", "Second", "content2")

	topic, err := store.GetTopic("server", 1)
	if err != nil {
		t.Fatalf("GetTopic(1) failed: %v", err)
	}
	if topic.Title != "First" {
		t.Errorf("expected 'First', got '%s'", topic.Title)
	}

	topic, err = store.GetTopic("server", 2)
	if err != nil {
		t.Fatalf("GetTopic(2) failed: %v", err)
	}
	if topic.Title != "Second" {
		t.Errorf("expected 'Second', got '%s'", topic.Title)
	}
}

func TestGetTopicOutOfRange(t *testing.T) {
	store := newTestStore(t)

	store.PublishTopic("server", "Only", "content")

	_, err := store.GetTopic("server", 0)
	if err == nil {
		t.Error("expected error for index 0")
	}

	_, err = store.GetTopic("server", 2)
	if err == nil {
		t.Error("expected error for index 2 (only 1 topic)")
	}
}

func TestEmptyTopics(t *testing.T) {
	store := newTestStore(t)

	topics, err := store.ListTopics("nobody")
	if err != nil {
		t.Fatalf("ListTopics failed: %v", err)
	}
	if topics != nil {
		t.Errorf("expected nil for empty topics, got %v", topics)
	}
}

func TestTopicOrdering(t *testing.T) {
	store := newTestStore(t)

	store.PublishTopic("server", "First", "1")
	time.Sleep(10 * time.Millisecond)
	store.PublishTopic("server", "Second", "2")
	time.Sleep(10 * time.Millisecond)
	store.PublishTopic("server", "Third", "3")

	topics, _ := store.ListTopics("server")
	if len(topics) != 3 {
		t.Fatalf("expected 3 topics, got %d", len(topics))
	}

	if topics[0].Title != "First" || topics[1].Title != "Second" || topics[2].Title != "Third" {
		t.Errorf("topics not in chronological order")
	}
}
