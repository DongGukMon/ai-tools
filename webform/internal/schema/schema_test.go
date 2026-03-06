package schema

import (
	"encoding/json"
	"os"
	"strings"
	"testing"
)

func TestReadFromStdin_Valid(t *testing.T) {
	input := `{"t":"Test","f":[["name","t","Name"]]}`

	r, w, _ := os.Pipe()
	w.WriteString(input)
	w.Close()

	origStdin := os.Stdin
	os.Stdin = r
	defer func() { os.Stdin = origStdin }()

	s, err := ReadFromStdin()
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if s.Title != "Test" {
		t.Errorf("expected title 'Test', got '%s'", s.Title)
	}
	if len(s.Fields) != 1 {
		t.Errorf("expected 1 field, got %d", len(s.Fields))
	}
	if s.JSON() != input {
		t.Errorf("JSON() mismatch: got '%s'", s.JSON())
	}
}

func TestReadFromStdin_WithAllFields(t *testing.T) {
	input := `{"t":"Full","d":"desc","to":60,"f":[["a","t","A"],["b","pw","B",{"r":1}]]}`

	r, w, _ := os.Pipe()
	w.WriteString(input)
	w.Close()

	origStdin := os.Stdin
	os.Stdin = r
	defer func() { os.Stdin = origStdin }()

	s, err := ReadFromStdin()
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if s.Title != "Full" {
		t.Errorf("expected title 'Full', got '%s'", s.Title)
	}
	if s.Description != "desc" {
		t.Errorf("expected description 'desc', got '%s'", s.Description)
	}
	if s.Timeout != 60 {
		t.Errorf("expected timeout 60, got %d", s.Timeout)
	}
	if len(s.Fields) != 2 {
		t.Errorf("expected 2 fields, got %d", len(s.Fields))
	}
}

func TestReadFromStdin_InvalidJSON(t *testing.T) {
	r, w, _ := os.Pipe()
	w.WriteString("{invalid")
	w.Close()

	origStdin := os.Stdin
	os.Stdin = r
	defer func() { os.Stdin = origStdin }()

	_, err := ReadFromStdin()
	if err == nil {
		t.Fatal("expected error for invalid JSON")
	}
}

func TestReadFromStdin_NoFields(t *testing.T) {
	r, w, _ := os.Pipe()
	w.WriteString(`{"t":"Test","f":[]}`)
	w.Close()

	origStdin := os.Stdin
	os.Stdin = r
	defer func() { os.Stdin = origStdin }()

	_, err := ReadFromStdin()
	if err == nil {
		t.Fatal("expected error for empty fields")
	}
	if !strings.Contains(err.Error(), "at least one field") {
		t.Errorf("unexpected error message: %v", err)
	}
}

func TestReadFromStdin_EmptyInput(t *testing.T) {
	r, w, _ := os.Pipe()
	w.WriteString("")
	w.Close()

	origStdin := os.Stdin
	os.Stdin = r
	defer func() { os.Stdin = origStdin }()

	_, err := ReadFromStdin()
	if err == nil {
		t.Fatal("expected error for empty input")
	}
}

func TestReference(t *testing.T) {
	ref := Reference()
	if ref == "" {
		t.Fatal("reference should not be empty")
	}

	// Should contain key type codes
	requiredTypes := []string{"t", "pw", "ta", "n", "sel", "msel", "rad", "cb", "url", "email", "json", "list", "grp"}
	for _, typ := range requiredTypes {
		if !strings.Contains(ref, typ) {
			t.Errorf("reference missing type: %s", typ)
		}
	}

	// Should contain key opts
	requiredOpts := []string{"r", "ph", "def", "o", "pat", "min", "max"}
	for _, opt := range requiredOpts {
		if !strings.Contains(ref, opt) {
			t.Errorf("reference missing opt: %s", opt)
		}
	}

	// Should contain a valid example
	if !strings.Contains(ref, "Example:") {
		t.Error("reference should contain an example")
	}

	// JSON field contract must be documented
	if !strings.Contains(ref, "raw string") || !strings.Contains(ref, "invalid JSON") {
		t.Error("reference should document json field string fallback contract")
	}
}

func TestSchema_FieldParsing(t *testing.T) {
	input := `{"t":"Test","f":[["key","pw","API Key",{"r":1}],["env","sel","Env",{"o":["dev","prod"]}]]}`

	r, w, _ := os.Pipe()
	w.WriteString(input)
	w.Close()

	origStdin := os.Stdin
	os.Stdin = r
	defer func() { os.Stdin = origStdin }()

	s, err := ReadFromStdin()
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	// Verify fields can be parsed as arrays
	for i, raw := range s.Fields {
		var field []json.RawMessage
		if err := json.Unmarshal(raw, &field); err != nil {
			t.Errorf("field %d: failed to parse as array: %v", i, err)
			continue
		}
		if len(field) < 3 {
			t.Errorf("field %d: expected at least 3 elements, got %d", i, len(field))
		}
	}
}
