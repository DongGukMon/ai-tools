# vaultkey - Claude Usage Guide

## When to Use

Use `vaultkey` when you need to read or update secrets without storing them in plain text.

- API keys, webhook secrets, tokens, or passwords
- Secrets shared across machines through a private Git repo
- Cases where the value should stay encrypted at rest

## Typical Workflow

```bash
# 1. Initialize once
vaultkey init git@github.com:your-org/secrets.git

# 2. Read a secret
vaultkey get menulens/prod JWT_SECRET

# 3. Update a secret
vaultkey set menulens/prod JWT_SECRET "new-secret"

# 4. Inspect available keys
vaultkey list menulens
```

## Help

Run `vaultkey --help` for the full command list.

## Notes

- Password input comes from `VAULTKEY_PASSWORD`, `--password`, or interactive prompt.
- Use scope names like `project/env`, for example `menulens/prod`.
- `set` and `delete` already sync changes; `push` and `pull` are for explicit repository sync.
