package schema

import (
	"encoding/json"
	"fmt"
	"math"
	"strconv"
	"strings"
	"unicode"
)

type dslField struct {
	Name     string
	Type     string
	Label    string
	Opts     map[string]any
	Children []*dslField
}

type fieldScope struct {
	fields *[]*dslField
	name   string
	line   int
}

var formOptionAliases = map[string]string{
	"d":           "d",
	"desc":        "d",
	"description": "d",
	"to":          "to",
	"timeout":     "to",
}

var fieldOptionAliases = map[string]string{
	"accept":      "accept",
	"def":         "def",
	"default":     "def",
	"f":           "f",
	"fields":      "f",
	"io":          "io",
	"itemopts":    "io",
	"it":          "it",
	"item":        "it",
	"max":         "max",
	"min":         "min",
	"mul":         "mul",
	"multi":       "mul",
	"multiple":    "mul",
	"o":           "o",
	"options":     "o",
	"pat":         "pat",
	"pattern":     "pat",
	"ph":          "ph",
	"placeholder": "ph",
	"r":           "r",
	"req":         "r",
	"required":    "r",
	"rows":        "rows",
	"step":        "step",
}

func parseDSL(input string) (*Schema, error) {
	lines := strings.Split(strings.ReplaceAll(input, "\r\n", "\n"), "\n")

	root := []*dslField{}
	stack := []fieldScope{{fields: &root}}

	var (
		title       string
		description string
		timeout     int
		sawForm     bool
	)

	for i, rawLine := range lines {
		lineNo := i + 1
		line := strings.TrimSpace(rawLine)
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}

		if line == "}" {
			if len(stack) == 1 {
				return nil, fmt.Errorf("line %d: unexpected }", lineNo)
			}
			stack = stack[:len(stack)-1]
			continue
		}

		tokens, err := splitTokens(line)
		if err != nil {
			return nil, fmt.Errorf("line %d: %w", lineNo, err)
		}
		if len(tokens) == 0 {
			continue
		}

		if tokens[0] == "form" {
			if sawForm {
				return nil, fmt.Errorf("line %d: form header already declared", lineNo)
			}
			if len(stack) != 1 {
				return nil, fmt.Errorf("line %d: form header must be at top level", lineNo)
			}
			title, description, timeout, err = parseFormTokens(tokens)
			if err != nil {
				return nil, fmt.Errorf("line %d: %w", lineNo, err)
			}
			sawForm = true
			continue
		}

		if !sawForm {
			return nil, fmt.Errorf("line %d: expected form header before fields", lineNo)
		}

		field, opensGroup, err := parseFieldTokens(tokens)
		if err != nil {
			return nil, fmt.Errorf("line %d: %w", lineNo, err)
		}

		current := stack[len(stack)-1].fields
		*current = append(*current, field)
		if opensGroup {
			stack = append(stack, fieldScope{
				fields: &field.Children,
				name:   field.Name,
				line:   lineNo,
			})
		}
	}

	if !sawForm {
		return nil, fmt.Errorf("schema must start with a form header")
	}
	if len(stack) != 1 {
		open := stack[len(stack)-1]
		return nil, fmt.Errorf("unclosed group %q opened at line %d", open.name, open.line)
	}

	fields := make([]any, 0, len(root))
	for _, field := range root {
		wire, err := field.toWire()
		if err != nil {
			return nil, err
		}
		fields = append(fields, wire)
	}

	return newSchema(title, description, timeout, fields)
}

func parseFormTokens(tokens []string) (string, string, int, error) {
	if len(tokens) < 2 {
		return "", "", 0, fmt.Errorf(`form header must look like: form "Title" [desc="..."] [timeout=120]`)
	}

	title, err := valueToString(tokens[1], "form title")
	if err != nil {
		return "", "", 0, err
	}

	var (
		description string
		timeout     int
	)
	for _, token := range tokens[2:] {
		key, raw, ok := strings.Cut(token, "=")
		if !ok {
			return "", "", 0, fmt.Errorf("invalid form option %q", token)
		}

		key = canonicalFormOptionKey(key)
		value, err := parseValue(raw)
		if err != nil {
			return "", "", 0, fmt.Errorf("invalid form option %q: %w", token, err)
		}

		switch key {
		case "d":
			description, err = stringifyScalar(value, "form desc")
			if err != nil {
				return "", "", 0, err
			}
		case "to":
			timeout, err = valueToInt(value, "form timeout")
			if err != nil {
				return "", "", 0, err
			}
		default:
			return "", "", 0, fmt.Errorf("unknown form option %q", key)
		}
	}

	return title, description, timeout, nil
}

func parseFieldTokens(tokens []string) (*dslField, bool, error) {
	opensGroup := false
	if len(tokens) > 0 && tokens[len(tokens)-1] == "{" {
		opensGroup = true
		tokens = tokens[:len(tokens)-1]
	}

	if len(tokens) < 3 {
		return nil, false, fmt.Errorf(`field must look like: <name> <type> "<label>" [opts...]`)
	}

	label, err := valueToString(tokens[2], "field label")
	if err != nil {
		return nil, false, err
	}

	field := &dslField{
		Name:     tokens[0],
		Type:     tokens[1],
		Label:    label,
		Opts:     map[string]any{},
		Children: []*dslField{},
	}

	if opensGroup && field.Type != "grp" {
		return nil, false, fmt.Errorf("only grp fields can open a block")
	}

	for _, token := range tokens[3:] {
		if err := applyFieldToken(field.Opts, token); err != nil {
			return nil, false, err
		}
	}

	return field, opensGroup, nil
}

func applyFieldToken(opts map[string]any, token string) error {
	if token == "" {
		return nil
	}

	if !strings.Contains(token, "=") {
		switch canonicalFieldOptionKey(token) {
		case "r":
			opts["r"] = 1
			return nil
		case "mul":
			opts["mul"] = 1
			return nil
		default:
			return fmt.Errorf("invalid field option %q", token)
		}
	}

	key, raw, _ := strings.Cut(token, "=")
	key = canonicalFieldOptionPath(key)

	value, err := parseValue(raw)
	if err != nil {
		return fmt.Errorf("invalid field option %q: %w", token, err)
	}

	last := key
	if idx := strings.LastIndex(key, "."); idx >= 0 {
		last = key[idx+1:]
	}
	if last == "r" || last == "mul" {
		value, err = normalizeToggle(value, last)
		if err != nil {
			return err
		}
	}

	return setNestedOption(opts, key, value)
}

func (f *dslField) toWire() (any, error) {
	var opts map[string]any
	if len(f.Opts) > 0 {
		opts = cloneMap(f.Opts)
	}

	if f.Type == "grp" {
		if opts == nil {
			opts = map[string]any{}
		}
		children := make([]any, 0, len(f.Children))
		for _, child := range f.Children {
			wire, err := child.toWire()
			if err != nil {
				return nil, err
			}
			children = append(children, wire)
		}
		opts["f"] = children
	}

	wire := []any{f.Name, f.Type, f.Label}
	if len(opts) > 0 {
		wire = append(wire, opts)
	}
	return wire, nil
}

func splitTokens(line string) ([]string, error) {
	var (
		tokens      []string
		current     strings.Builder
		inQuote     bool
		escaped     bool
		squareDepth int
		braceDepth  int
	)

	for i, r := range line {
		if !inQuote && squareDepth == 0 && braceDepth == 0 && current.Len() == 0 && r == '{' && strings.TrimSpace(line[i:]) == "{" {
			tokens = append(tokens, "{")
			return tokens, nil
		}

		if inQuote {
			current.WriteRune(r)
			if escaped {
				escaped = false
				continue
			}
			if r == '\\' {
				escaped = true
				continue
			}
			if r == '"' {
				inQuote = false
			}
			continue
		}

		switch {
		case r == '"':
			inQuote = true
			current.WriteRune(r)
		case r == '[':
			squareDepth++
			current.WriteRune(r)
		case r == ']':
			squareDepth--
			if squareDepth < 0 {
				return nil, fmt.Errorf("unexpected ]")
			}
			current.WriteRune(r)
		case r == '{':
			braceDepth++
			current.WriteRune(r)
		case r == '}':
			braceDepth--
			if braceDepth < 0 {
				return nil, fmt.Errorf("unexpected }")
			}
			current.WriteRune(r)
		case unicode.IsSpace(r) && squareDepth == 0 && braceDepth == 0:
			if current.Len() > 0 {
				tokens = append(tokens, current.String())
				current.Reset()
			}
		default:
			current.WriteRune(r)
		}
	}

	if inQuote {
		return nil, fmt.Errorf("unterminated quoted string")
	}
	if squareDepth != 0 {
		return nil, fmt.Errorf("unterminated array value")
	}
	if braceDepth != 0 {
		return nil, fmt.Errorf("unterminated object value")
	}
	if current.Len() > 0 {
		tokens = append(tokens, current.String())
	}

	return tokens, nil
}

func parseValue(token string) (any, error) {
	token = strings.TrimSpace(token)
	if token == "" {
		return nil, fmt.Errorf("empty value")
	}

	switch {
	case strings.HasPrefix(token, "\""):
		value, err := strconv.Unquote(token)
		if err != nil {
			return nil, fmt.Errorf("invalid quoted string: %w", err)
		}
		return value, nil
	case strings.HasPrefix(token, "[") && strings.HasSuffix(token, "]"):
		return parseArray(token)
	case strings.HasPrefix(token, "{") && strings.HasSuffix(token, "}"):
		var value any
		if err := json.Unmarshal([]byte(token), &value); err != nil {
			return nil, fmt.Errorf("invalid inline JSON: %w", err)
		}
		return value, nil
	case token == "true":
		return true, nil
	case token == "false":
		return false, nil
	case token == "null":
		return nil, nil
	}

	if i, err := strconv.Atoi(token); err == nil {
		return i, nil
	}
	if f, err := strconv.ParseFloat(token, 64); err == nil && strings.ContainsAny(token, ".eE") {
		return f, nil
	}

	return token, nil
}

func parseArray(token string) ([]any, error) {
	inner := strings.TrimSpace(token[1 : len(token)-1])
	if inner == "" {
		return []any{}, nil
	}

	parts, err := splitDelimited(inner, ',')
	if err != nil {
		return nil, err
	}

	values := make([]any, 0, len(parts))
	for _, part := range parts {
		value, err := parseValue(part)
		if err != nil {
			return nil, err
		}
		values = append(values, value)
	}

	return values, nil
}

func splitDelimited(input string, delim rune) ([]string, error) {
	var (
		parts       []string
		current     strings.Builder
		inQuote     bool
		escaped     bool
		squareDepth int
		braceDepth  int
	)

	flush := func() error {
		part := strings.TrimSpace(current.String())
		if part == "" {
			return fmt.Errorf("empty value")
		}
		parts = append(parts, part)
		current.Reset()
		return nil
	}

	for _, r := range input {
		if inQuote {
			current.WriteRune(r)
			if escaped {
				escaped = false
				continue
			}
			if r == '\\' {
				escaped = true
				continue
			}
			if r == '"' {
				inQuote = false
			}
			continue
		}

		switch r {
		case '"':
			inQuote = true
			current.WriteRune(r)
		case '[':
			squareDepth++
			current.WriteRune(r)
		case ']':
			squareDepth--
			if squareDepth < 0 {
				return nil, fmt.Errorf("unexpected ]")
			}
			current.WriteRune(r)
		case '{':
			braceDepth++
			current.WriteRune(r)
		case '}':
			braceDepth--
			if braceDepth < 0 {
				return nil, fmt.Errorf("unexpected }")
			}
			current.WriteRune(r)
		default:
			if r == delim && squareDepth == 0 && braceDepth == 0 {
				if err := flush(); err != nil {
					return nil, err
				}
				continue
			}
			current.WriteRune(r)
		}
	}

	if inQuote {
		return nil, fmt.Errorf("unterminated quoted string")
	}
	if squareDepth != 0 {
		return nil, fmt.Errorf("unterminated array value")
	}
	if braceDepth != 0 {
		return nil, fmt.Errorf("unterminated object value")
	}
	if err := flush(); err != nil {
		return nil, err
	}

	return parts, nil
}

func canonicalFormOptionKey(key string) string {
	key = strings.TrimSpace(key)
	if alias, ok := formOptionAliases[key]; ok {
		return alias
	}
	return key
}

func canonicalFieldOptionPath(path string) string {
	parts := strings.Split(strings.TrimSpace(path), ".")
	for i, part := range parts {
		parts[i] = canonicalFieldOptionKey(part)
	}
	return strings.Join(parts, ".")
}

func canonicalFieldOptionKey(key string) string {
	key = strings.TrimSpace(key)
	if alias, ok := fieldOptionAliases[key]; ok {
		return alias
	}
	return key
}

func setNestedOption(opts map[string]any, path string, value any) error {
	parts := strings.Split(path, ".")
	current := opts
	for i, part := range parts {
		if part == "" {
			return fmt.Errorf("invalid option path %q", path)
		}
		if i == len(parts)-1 {
			current[part] = value
			return nil
		}

		next, ok := current[part]
		if !ok {
			child := map[string]any{}
			current[part] = child
			current = child
			continue
		}

		child, ok := next.(map[string]any)
		if !ok {
			return fmt.Errorf("option path %q conflicts with existing scalar value", path)
		}
		current = child
	}

	return nil
}

func valueToString(token string, context string) (string, error) {
	value, err := parseValue(token)
	if err != nil {
		return "", err
	}
	return stringifyScalar(value, context)
}

func stringifyScalar(value any, context string) (string, error) {
	switch v := value.(type) {
	case nil:
		return "", nil
	case string:
		return v, nil
	case bool, int, float64:
		return fmt.Sprint(v), nil
	default:
		return "", fmt.Errorf("%s must be a scalar value", context)
	}
}

func valueToInt(value any, context string) (int, error) {
	switch v := value.(type) {
	case int:
		return v, nil
	case float64:
		if math.Trunc(v) != v {
			return 0, fmt.Errorf("%s must be an integer", context)
		}
		return int(v), nil
	case string:
		i, err := strconv.Atoi(v)
		if err != nil {
			return 0, fmt.Errorf("%s must be an integer", context)
		}
		return i, nil
	default:
		return 0, fmt.Errorf("%s must be an integer", context)
	}
}

func normalizeToggle(value any, name string) (int, error) {
	switch v := value.(type) {
	case bool:
		if v {
			return 1, nil
		}
		return 0, nil
	case int:
		if v == 0 || v == 1 {
			return v, nil
		}
	case float64:
		if v == 0 || v == 1 {
			return int(v), nil
		}
	case string:
		switch v {
		case "true", "1":
			return 1, nil
		case "false", "0":
			return 0, nil
		}
	}

	return 0, fmt.Errorf("%s must be true/false or 1/0", name)
}

func cloneMap(src map[string]any) map[string]any {
	dst := make(map[string]any, len(src))
	for key, value := range src {
		if nested, ok := value.(map[string]any); ok {
			dst[key] = cloneMap(nested)
			continue
		}
		dst[key] = value
	}
	return dst
}
