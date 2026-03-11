package schema

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"os"
)

type Schema struct {
	Title       string            `json:"t"`
	Description string            `json:"d,omitempty"`
	Timeout     int               `json:"to,omitempty"`
	Fields      []json.RawMessage `json:"f"`
	raw         string
}

func ReadFromStdin() (*Schema, error) {
	data, err := io.ReadAll(os.Stdin)
	if err != nil {
		return nil, err
	}

	trimmed := bytes.TrimSpace(data)
	if len(trimmed) == 0 {
		return nil, fmt.Errorf("schema input is empty")
	}

	if trimmed[0] == '{' {
		return parseJSON(data)
	}

	return parseDSL(string(data))
}

func parseJSON(data []byte) (*Schema, error) {
	var s Schema
	if err := json.Unmarshal(data, &s); err != nil {
		return nil, fmt.Errorf("invalid JSON: %w", err)
	}

	if err := validate(&s); err != nil {
		return nil, err
	}

	s.raw = string(data)
	return &s, nil
}

func newSchema(title, description string, timeout int, fields []any) (*Schema, error) {
	rawFields := make([]json.RawMessage, 0, len(fields))
	for _, field := range fields {
		data, err := json.Marshal(field)
		if err != nil {
			return nil, fmt.Errorf("marshal field: %w", err)
		}
		rawFields = append(rawFields, data)
	}

	wire := map[string]any{
		"t": title,
		"f": fields,
	}
	if description != "" {
		wire["d"] = description
	}
	if timeout > 0 {
		wire["to"] = timeout
	}

	raw, err := json.Marshal(wire)
	if err != nil {
		return nil, fmt.Errorf("marshal schema: %w", err)
	}

	s := &Schema{
		Title:       title,
		Description: description,
		Timeout:     timeout,
		Fields:      rawFields,
		raw:         string(raw),
	}
	if err := validate(s); err != nil {
		return nil, err
	}
	return s, nil
}

func validate(s *Schema) error {
	if len(s.Fields) == 0 {
		return fmt.Errorf("schema must have at least one field")
	}
	return nil
}

// NewViewSchema creates a view-only schema with a single c_html content field.
func NewViewSchema(title, htmlBody string) (*Schema, error) {
	field := []any{"content", "c_html", title, map[string]any{"body": htmlBody}}
	return newSchema(title, "", 0, []any{field})
}

func (s *Schema) JSON() string {
	return s.raw
}

func (s *Schema) SetRaw(raw string) {
	s.raw = raw
}

func Reference() string {
	return `Preferred input: DSL

Header:
  form "Title" [desc="Description"] [timeout=120]

Field line:
  <name> <type> "<label>" [opts...]

Types:
  t pw ta n sel msel rad cb url email tel date time dt
  color range file json list grp

Content types (c_* prefix, display-only, not collected in submit data):
  c_md       Rendered markdown         opts: {body: "# markdown..."}
  c_table    Structured table          opts: {headers: ["A","B"], rows: [["1","2"]]}
  c_json     Pretty-printed JSON       opts: {body: "{...}" or {...}}
  c_code     Code block with syntax    opts: {body: "code...", lang: "go"}
  c_text     Fixed-width plain text    opts: {body: "plain text"}
  c_kv       Key-value pairs           opts: {entries: [["key","val"],...]}
  c_html     Raw HTML                  opts: {body: "<div>...</div>"}

Flags:
  req            required
  multi          multiple files (file -> mul=1)

Common opts:
  ph="..."       placeholder
  def="..."      default value
  o=[a,b,c]      options for sel / msel / rad
  min=1 max=10   numeric or length bounds
  step=1         number / range step
  rows=6         ta / json rows
  accept="..."   file accept types
  it=url         list item type
  io.ph="..."    list item opts

Group blocks:
  profile grp "Profile" {
    email email "Email" req
    links list "Links" it=url io.ph="https://..."
  }

Value rules:
  - Strings with spaces must be quoted
  - Arrays use [a,b,c]
  - Inline JSON values are allowed in opts, e.g. def={"enabled":true}

Example:
  form "Deploy Config" timeout=120
  env sel "Environment" req o=[dev,staging,prod]
  key pw "API Key" req
  endpoints list "Endpoints" it=url io.ph="https://..."
  advanced grp "Advanced" {
    payload json "Payload" rows=8 def={"retries":3}
    notify cb "Send notification" def=true
  }

JSON fallback:
  {"t":"Deploy Config","f":[["env","sel","Environment",{"r":1,"o":["dev","staging","prod"]}]]}

Need CLI flags instead? Run: webform --help
`
}
