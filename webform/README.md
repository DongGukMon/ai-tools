# webform

Dynamic web form for collecting structured data from users. AI generates a compact schema, opens a browser form, and receives the submitted data as JSON.

## The Problem

Terminal prompts are fine for simple inputs, but collecting complex, multi-field, or sensitive data (passwords, API keys) is clunky. Copy-pasting multi-line JSON or filling many sequential prompts is error-prone.

## The Solution

`webform` opens a real web form in the browser. The AI describes what it needs as a compact JSON schema, and the user fills it out with proper UI controls — dropdowns, checkboxes, password fields, file uploads, and more.

## Quick Start

```bash
# Install
curl -fsSL https://raw.githubusercontent.com/bang9/ai-tools/main/webform/install.sh | bash

# Open a form
webform <<< '{"t":"API Config","f":[["key","pw","API Key",{"r":1}],["env","sel","Environment",{"o":["dev","staging","prod"]}]]}'
```

## Commands

| Command | Description |
|---------|-------------|
| `webform` | Read schema from stdin, open form, print result |
| `webform schema` | Print schema format reference |
| `webform --timeout N` | Set timeout in seconds (default: 300) |
| `webform version` | Print version |
| `webform upgrade` | Update to latest version |

## Schema Format

```
{"t":"title","d":"desc","to":timeout,"f":[[name,type,label,{opts}],...]}
```

**Field types:**

| Code | Type | Code | Type | Code | Type |
|------|------|------|------|------|------|
| `t` | text | `pw` | password | `ta` | textarea |
| `n` | number | `sel` | select | `msel` | multiselect |
| `rad` | radio | `cb` | checkbox | `url` | url |
| `email` | email | `tel` | tel | `date` | date |
| `time` | time | `dt` | datetime | `color` | color |
| `range` | range | `file` | file | `json` | json editor |
| `list` | dynamic list | `grp` | field group | | |

**Options:**

| Key | Description | Key | Description |
|-----|-------------|-----|-------------|
| `r` | required (1/0) | `ph` | placeholder |
| `def` | default value | `o` | options array |
| `pat` | regex pattern | `min` | min value/length |
| `max` | max value/length | `step` | step increment |
| `rows` | textarea rows | `accept` | file accept types |

## Example

```bash
webform <<< '{"t":"Deploy Config","to":120,"f":[
  ["env","sel","Environment",{"o":["dev","staging","prod"],"r":1}],
  ["key","pw","API Key",{"r":1}],
  ["endpoints","list","Endpoints",{"it":"url"}],
  ["notify","cb","Send notification"]
]}'
```

Result:
```json
{"status":"submitted","data":{"env":"prod","key":"sk-...","endpoints":["https://..."],"notify":true}}
```

Status values: `submitted`, `cancelled`, `timeout`

## How It Works

1. CLI reads schema JSON from stdin
2. Starts a temporary local HTTP server on a random port
3. Opens the form in the default browser
4. User fills out and submits (or cancels / times out)
5. Server prints result JSON to stdout and exits
6. Browser tab auto-closes

Security: Each session uses a one-time token. Server binds to localhost only.

## Build from Source

```bash
cd webform
make build    # Build CLI binary
make test     # Run tests
make cross    # Cross-compile for all platforms
```

## License

MIT
