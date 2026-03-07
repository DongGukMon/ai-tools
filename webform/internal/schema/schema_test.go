package schema

import (
	"encoding/json"
	"os"
	"strings"
	"testing"
)

func withStdin(t *testing.T, input string, fn func()) {
	t.Helper()

	r, w, err := os.Pipe()
	if err != nil {
		t.Fatalf("pipe: %v", err)
	}
	if _, err := w.WriteString(input); err != nil {
		t.Fatalf("write stdin: %v", err)
	}
	w.Close()

	origStdin := os.Stdin
	os.Stdin = r
	defer func() { os.Stdin = origStdin }()

	fn()
}

func TestReadFromStdin_Valid(t *testing.T) {
	input := `{"t":"Test","f":[["name","t","Name"]]}`

	withStdin(t, input, func() {
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
	})
}

func TestReadFromStdin_WithAllFields(t *testing.T) {
	input := `{"t":"Full","d":"desc","to":60,"f":[["a","t","A"],["b","pw","B",{"r":1}]]}`

	withStdin(t, input, func() {
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
	})
}

func TestReadFromStdin_DSL(t *testing.T) {
	input := `form "Deploy Config" timeout=120
env sel "Environment" req o=[dev,staging,prod]
key pw "API Key" req
endpoints list "Endpoints" it=url io.ph="https://..."
advanced grp "Advanced" {
  payload json "Payload" rows=8 def={"retries":3}
  notify cb "Send notification" def=true
}`

	withStdin(t, input, func() {
		s, err := ReadFromStdin()
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if s.Title != "Deploy Config" {
			t.Fatalf("expected title, got %q", s.Title)
		}
		if s.Timeout != 120 {
			t.Fatalf("expected timeout 120, got %d", s.Timeout)
		}
		if len(s.Fields) != 4 {
			t.Fatalf("expected 4 fields, got %d", len(s.Fields))
		}

		var wire map[string]any
		if err := json.Unmarshal([]byte(s.JSON()), &wire); err != nil {
			t.Fatalf("canonical JSON invalid: %v", err)
		}

		if wire["t"] != "Deploy Config" {
			t.Fatalf("expected canonical title, got %#v", wire["t"])
		}

		fields, ok := wire["f"].([]any)
		if !ok || len(fields) != 4 {
			t.Fatalf("expected 4 canonical fields, got %#v", wire["f"])
		}

		group, ok := fields[3].([]any)
		if !ok || len(group) < 4 {
			t.Fatalf("expected group field with opts, got %#v", fields[3])
		}

		opts, ok := group[3].(map[string]any)
		if !ok {
			t.Fatalf("expected group opts map, got %#v", group[3])
		}

		children, ok := opts["f"].([]any)
		if !ok || len(children) != 2 {
			t.Fatalf("expected 2 nested fields, got %#v", opts["f"])
		}
	})
}

func TestReadFromStdin_DSLBeforeForm(t *testing.T) {
	input := `key pw "API Key" req`

	withStdin(t, input, func() {
		_, err := ReadFromStdin()
		if err == nil {
			t.Fatal("expected error when form header is missing")
		}
		if !strings.Contains(err.Error(), "form header") {
			t.Fatalf("unexpected error: %v", err)
		}
	})
}

func TestReadFromStdin_DSLUnclosedGroup(t *testing.T) {
	input := `form "Config"
advanced grp "Advanced" {
  key pw "API Key" req`

	withStdin(t, input, func() {
		_, err := ReadFromStdin()
		if err == nil {
			t.Fatal("expected error for unclosed group")
		}
		if !strings.Contains(err.Error(), "unclosed group") {
			t.Fatalf("unexpected error: %v", err)
		}
	})
}

func TestReadFromStdin_InvalidJSON(t *testing.T) {
	withStdin(t, "{invalid", func() {
		_, err := ReadFromStdin()
		if err == nil {
			t.Fatal("expected error for invalid JSON")
		}
	})
}

func TestReadFromStdin_NoFields(t *testing.T) {
	withStdin(t, `{"t":"Test","f":[]}`, func() {
		_, err := ReadFromStdin()
		if err == nil {
			t.Fatal("expected error for empty fields")
		}
		if !strings.Contains(err.Error(), "at least one field") {
			t.Errorf("unexpected error message: %v", err)
		}
	})
}

func TestReadFromStdin_EmptyInput(t *testing.T) {
	withStdin(t, "", func() {
		_, err := ReadFromStdin()
		if err == nil {
			t.Fatal("expected error for empty input")
		}
		if !strings.Contains(err.Error(), "empty") {
			t.Fatalf("unexpected error: %v", err)
		}
	})
}

func TestReference(t *testing.T) {
	ref := Reference()
	if ref == "" {
		t.Fatal("reference should not be empty")
	}

	requiredSnippets := []string{
		`form "Title"`,
		`<name> <type> "<label>"`,
		`req`,
		`io.ph`,
		`grp "Profile" {`,
		`JSON fallback:`,
		`webform --help`,
	}
	for _, snippet := range requiredSnippets {
		if !strings.Contains(ref, snippet) {
			t.Errorf("reference missing snippet: %s", snippet)
		}
	}
}

func TestSchema_FieldParsing(t *testing.T) {
	input := `{"t":"Test","f":[["key","pw","API Key",{"r":1}],["env","sel","Env",{"o":["dev","prod"]}]]}`

	withStdin(t, input, func() {
		s, err := ReadFromStdin()
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}

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
	})
}
