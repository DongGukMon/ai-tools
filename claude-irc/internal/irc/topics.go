package irc

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"time"
)

// Topic represents a published context entry.
type Topic struct {
	Title     string    `json:"title"`
	Content   string    `json:"content"`
	Timestamp time.Time `json:"timestamp"`
}

// PublishTopic writes a topic to the peer's topics directory.
// If a topic with the same title exists, it is replaced (updated).
func (s *Store) PublishTopic(name, title, content string) error {
	dir := s.TopicsDir(name)
	if err := os.MkdirAll(dir, 0755); err != nil {
		return fmt.Errorf("failed to create topics dir: %w", err)
	}

	// Check for existing topic with same title and remove it
	entries, _ := os.ReadDir(dir)
	for _, entry := range entries {
		if entry.IsDir() || filepath.Ext(entry.Name()) != ".json" {
			continue
		}
		data, err := os.ReadFile(filepath.Join(dir, entry.Name()))
		if err != nil {
			continue
		}
		var existing Topic
		if err := json.Unmarshal(data, &existing); err != nil {
			continue
		}
		if existing.Title == title {
			os.Remove(filepath.Join(dir, entry.Name()))
		}
	}

	topic := Topic{
		Title:     title,
		Content:   content,
		Timestamp: time.Now(),
	}

	data, err := json.MarshalIndent(topic, "", "  ")
	if err != nil {
		return fmt.Errorf("failed to marshal topic: %w", err)
	}
	data = append(data, '\n')

	filename := fmt.Sprintf("%d.json", time.Now().UnixNano())
	return os.WriteFile(filepath.Join(dir, filename), data, 0644)
}

// ListTopics returns all topics for a peer, sorted chronologically.
func (s *Store) ListTopics(name string) ([]Topic, error) {
	dir := s.TopicsDir(name)
	entries, err := os.ReadDir(dir)
	if err != nil {
		if os.IsNotExist(err) {
			return nil, nil
		}
		return nil, fmt.Errorf("failed to read topics: %w", err)
	}

	var topics []Topic
	for _, entry := range entries {
		if entry.IsDir() || filepath.Ext(entry.Name()) != ".json" {
			continue
		}

		data, err := os.ReadFile(filepath.Join(dir, entry.Name()))
		if err != nil {
			continue
		}

		var topic Topic
		if err := json.Unmarshal(data, &topic); err != nil {
			continue
		}
		topics = append(topics, topic)
	}

	sort.Slice(topics, func(i, j int) bool {
		return topics[i].Timestamp.Before(topics[j].Timestamp)
	})

	return topics, nil
}

// GetTopic returns a specific topic by 1-based index.
func (s *Store) GetTopic(name string, index int) (*Topic, error) {
	topics, err := s.ListTopics(name)
	if err != nil {
		return nil, err
	}

	if index < 1 || index > len(topics) {
		return nil, fmt.Errorf("topic index %d out of range (1-%d)", index, len(topics))
	}

	return &topics[index-1], nil
}

// DeleteTopic removes a specific topic by 1-based index.
func (s *Store) DeleteTopic(name string, index int) error {
	dir := s.TopicsDir(name)
	files, err := s.topicFiles(name)
	if err != nil {
		return err
	}

	if index < 1 || index > len(files) {
		return fmt.Errorf("topic index %d out of range (1-%d)", index, len(files))
	}

	return os.Remove(filepath.Join(dir, files[index-1]))
}

// ClearTopics removes all topics for a peer.
func (s *Store) ClearTopics(name string) error {
	return os.RemoveAll(s.TopicsDir(name))
}

// topicFiles returns sorted filenames for a peer's topics.
func (s *Store) topicFiles(name string) ([]string, error) {
	dir := s.TopicsDir(name)
	entries, err := os.ReadDir(dir)
	if err != nil {
		if os.IsNotExist(err) {
			return nil, nil
		}
		return nil, err
	}

	type topicFile struct {
		name      string
		timestamp time.Time
	}
	var tfs []topicFile
	for _, entry := range entries {
		if entry.IsDir() || filepath.Ext(entry.Name()) != ".json" {
			continue
		}
		data, err := os.ReadFile(filepath.Join(dir, entry.Name()))
		if err != nil {
			continue
		}
		var t Topic
		if err := json.Unmarshal(data, &t); err != nil {
			continue
		}
		tfs = append(tfs, topicFile{name: entry.Name(), timestamp: t.Timestamp})
	}

	sort.Slice(tfs, func(i, j int) bool {
		return tfs[i].timestamp.Before(tfs[j].timestamp)
	})

	var names []string
	for _, tf := range tfs {
		names = append(names, tf.name)
	}
	return names, nil
}
