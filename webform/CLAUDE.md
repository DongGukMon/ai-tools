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
webform <<'EOF'
form "API Config"
key pw "API Key" req
env sel "Environment" req o=[dev,staging,prod]
EOF

# 2. Wait for the browser form to be submitted
# 3. Read stdout JSON
# -> {"status":"submitted","data":{"key":"...","env":"prod"}}
```

## Help

Run `webform schema` when you need the DSL format, and `webform --help` for CLI flags.

## Notes

- The server binds to localhost only and uses a one-time token.
- Prefer `pw`, `sel`, `cb`, `list`, and validation options over ad hoc text prompts.
- The result always comes back as JSON with `submitted`, `cancelled`, or `timeout`.
