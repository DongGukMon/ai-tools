package redit

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"time"
)

const (
	originFile  = "origin"
	workingFile = "working"
	metaFile    = "meta.json"
)

type Meta struct {
	Key       string    `json:"key"`
	CreatedAt time.Time `json:"created_at"`
}

type Store struct {
	baseDir string
}

func NewStore() (*Store, error) {
	homeDir, err := os.UserHomeDir()
	if err != nil {
		return nil, fmt.Errorf("failed to get home directory: %w", err)
	}

	baseDir := filepath.Join(homeDir, ".redit")
	if err := os.MkdirAll(baseDir, 0755); err != nil {
		return nil, fmt.Errorf("failed to create base directory: %w", err)
	}

	return &Store{baseDir: baseDir}, nil
}

func (s *Store) keyToDir(key string) string {
	hash := sha256.Sum256([]byte(key))
	return filepath.Join(s.baseDir, hex.EncodeToString(hash[:8]))
}

func (s *Store) Init(key string, content io.Reader) (string, error) {
	dir := s.keyToDir(key)

	// Check if already exists
	if _, err := os.Stat(dir); err == nil {
		return "", fmt.Errorf("key already exists: %s (use 'drop' first)", key)
	}

	if err := os.MkdirAll(dir, 0755); err != nil {
		return "", fmt.Errorf("failed to create directory: %w", err)
	}

	// Read content
	data, err := io.ReadAll(content)
	if err != nil {
		return "", fmt.Errorf("failed to read content: %w", err)
	}

	// Write origin
	originPath := filepath.Join(dir, originFile)
	if err := os.WriteFile(originPath, data, 0644); err != nil {
		os.RemoveAll(dir)
		return "", fmt.Errorf("failed to write origin: %w", err)
	}

	// Write working (copy of origin)
	workingPath := filepath.Join(dir, workingFile)
	if err := os.WriteFile(workingPath, data, 0644); err != nil {
		os.RemoveAll(dir)
		return "", fmt.Errorf("failed to write working: %w", err)
	}

	// Write meta
	meta := Meta{
		Key:       key,
		CreatedAt: time.Now(),
	}
	metaData, err := json.Marshal(meta)
	if err != nil {
		os.RemoveAll(dir)
		return "", fmt.Errorf("failed to marshal meta: %w", err)
	}
	if err := os.WriteFile(filepath.Join(dir, metaFile), metaData, 0644); err != nil {
		os.RemoveAll(dir)
		return "", fmt.Errorf("failed to write meta: %w", err)
	}

	return workingPath, nil
}

func (s *Store) Get(key string) (string, error) {
	dir := s.keyToDir(key)
	workingPath := filepath.Join(dir, workingFile)

	if _, err := os.Stat(workingPath); os.IsNotExist(err) {
		return "", fmt.Errorf("key not found: %s", key)
	}

	return workingPath, nil
}

func (s *Store) Read(key string) ([]byte, error) {
	workingPath, err := s.Get(key)
	if err != nil {
		return nil, err
	}

	return os.ReadFile(workingPath)
}

func (s *Store) Status(key string) (string, error) {
	dir := s.keyToDir(key)

	originPath := filepath.Join(dir, originFile)
	workingPath := filepath.Join(dir, workingFile)

	originData, err := os.ReadFile(originPath)
	if err != nil {
		return "", fmt.Errorf("key not found: %s", key)
	}

	workingData, err := os.ReadFile(workingPath)
	if err != nil {
		return "", fmt.Errorf("working file not found: %s", key)
	}

	originHash := sha256.Sum256(originData)
	workingHash := sha256.Sum256(workingData)

	if originHash == workingHash {
		return "clean", nil
	}
	return "dirty", nil
}

func (s *Store) Reset(key string) error {
	dir := s.keyToDir(key)

	originPath := filepath.Join(dir, originFile)
	workingPath := filepath.Join(dir, workingFile)

	originData, err := os.ReadFile(originPath)
	if err != nil {
		return fmt.Errorf("key not found: %s", key)
	}

	if err := os.WriteFile(workingPath, originData, 0644); err != nil {
		return fmt.Errorf("failed to reset working file: %w", err)
	}

	return nil
}

func (s *Store) Drop(key string) error {
	dir := s.keyToDir(key)

	if _, err := os.Stat(dir); os.IsNotExist(err) {
		return fmt.Errorf("key not found: %s", key)
	}

	return os.RemoveAll(dir)
}

type ListItem struct {
	Key    string
	Status string
	Path   string
}

func (s *Store) List() ([]ListItem, error) {
	entries, err := os.ReadDir(s.baseDir)
	if err != nil {
		if os.IsNotExist(err) {
			return []ListItem{}, nil
		}
		return nil, fmt.Errorf("failed to read directory: %w", err)
	}

	var items []ListItem
	for _, entry := range entries {
		if !entry.IsDir() {
			continue
		}

		metaPath := filepath.Join(s.baseDir, entry.Name(), metaFile)
		metaData, err := os.ReadFile(metaPath)
		if err != nil {
			continue
		}

		var meta Meta
		if err := json.Unmarshal(metaData, &meta); err != nil {
			continue
		}

		status, _ := s.Status(meta.Key)
		workingPath := filepath.Join(s.baseDir, entry.Name(), workingFile)

		items = append(items, ListItem{
			Key:    meta.Key,
			Status: status,
			Path:   workingPath,
		})
	}

	return items, nil
}

func (s *Store) GetOriginPath(key string) (string, error) {
	dir := s.keyToDir(key)
	originPath := filepath.Join(dir, originFile)

	if _, err := os.Stat(originPath); os.IsNotExist(err) {
		return "", fmt.Errorf("key not found: %s", key)
	}

	return originPath, nil
}
