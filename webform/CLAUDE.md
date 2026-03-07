# webform - Claude Usage Guide

## When to Use

Use `webform` when terminal input is too awkward for the data you need.

- Sensitive values such as API keys or passwords
- Multi-field configuration
- Inputs that benefit from selects, checkboxes, validation, or dynamic lists

If you do not remember the schema format, run `webform schema` first.

## Typical Workflow

```bash
# 1. Define a compact schema
webform <<< '{
  "t":"API Config",
  "f":[
    ["key","pw","API Key",{"r":1}],
    ["env","sel","Environment",{"o":["dev","staging","prod"],"r":1}]
  ]
}'

# 2. Wait for the browser form to be submitted
# 3. Read stdout JSON
# -> {"status":"submitted","data":{"key":"...","env":"prod"}}
```

## Help

Run `webform --help` and `webform schema` when you need the full CLI or schema reference.

## Notes

- The server binds to localhost only and uses a one-time token.
- Prefer `pw`, `sel`, `cb`, `list`, and validation options over ad hoc text prompts.
- The result always comes back as JSON with `submitted`, `cancelled`, or `timeout`.
