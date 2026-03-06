# webform - Claude Usage Guide

## Overview

`webform` opens a dynamic web form in the browser to collect structured data from the user. Use it when terminal input is insufficient — complex, multi-field, or long-form data entry.

## Usage

### Schema Helper

```bash
webform schema
```

Prints the compact schema reference. Call this first if you need to remember the format.

### Collect Data

```bash
webform [--timeout N] <<< '<schema JSON>'
```

Reads schema from stdin, opens a browser form, waits for submission, prints result JSON to stdout.

### Schema Format

```
{"t":"title","d":"desc","to":timeout,"f":[[name,type,label,{opts}],...]}
```

**Field tuple:** `[name, type, label, opts?]`

**Types:**
```
t       text            pw      password        ta      textarea
n       number          sel     select          msel    multiselect
rad     radio           cb      checkbox        url     url
email   email           tel     tel             date    date
time    time            dt      datetime        color   color
range   range           file    file            json    json editor
list    dynamic list    grp     field group
```

**Opts:**
```
r       required (1/0)          ph      placeholder
def     default value           o       options []
pat     regex pattern           min     min value/length
max     max value/length        step    step increment
rows    textarea rows           it      item type (list)
io      item opts (list)        f       sub fields (grp)
accept  file accept types       mul     multiple files (1/0)
```

### Example

```bash
webform <<< '{"t":"API Config","to":120,"f":[["key","pw","API Key",{"r":1}],["env","sel","Environment",{"o":["dev","staging","prod"]}],["endpoints","list","Endpoints",{"it":"url"}]]}'
```

### Result Format

```json
{"status":"submitted","data":{"key":"sk-...","env":"prod","endpoints":["https://..."]}}
```

Possible `status` values: `submitted`, `cancelled`, `timeout`

## When to Use

- Collecting API keys, tokens, or credentials (password fields mask input)
- Multi-field configuration that would be tedious via terminal prompts
- Data with validation needs (email, URL, required fields)
- Structured input with selects, checkboxes, radio buttons
- Lists of items (dynamic add/remove)
- JSON configuration input

## How It Works

1. CLI reads schema JSON from stdin
2. Starts a temporary local HTTP server on a random port
3. Opens the form in the default browser
4. User fills out and submits (or cancels / timeout)
5. Server prints result JSON to stdout and exits
6. Browser tab auto-closes after 5 seconds

Security: Each session uses a one-time token. Server binds to localhost only.

## Installation

```bash
curl -fsSL https://raw.githubusercontent.com/bang9/ai-tools/main/webform/install.sh | bash
```

Or build locally:
```bash
cd webform && make build
```
