# redit - Claude Usage Guide

## Overview

`redit` is a local cache layer for efficiently editing remote documents (Confluence, Notion, etc.).
For APIs that don't support partial updates, edit locally and perform a single update.

## Core Principles

1. **Fetch from the source system, edit with redit, push final content back**
2. **Use Edit tool for partial modifications** - no need to regenerate entire content
3. **Commit only when dirty** - skip API call if no changes

## Commands

```bash
redit init <key>     # stdin → create origin + working, return working path
redit get <key>      # return working path
redit read <key>     # output working content to stdout
redit status <key>   # dirty/clean status
redit diff <key>     # diff between origin and working
redit reset <key>    # restore working to origin
redit drop <key>     # delete all files
redit list           # list all keys
```

## Workflow

### Basic Pattern

```
1. Fetch document content from the source system
   content = <fetch command or existing content>

2. Store in redit
   path = $(echo "$content" | redit init "<service>:<id>")

3. Partial edit with Edit tool (can repeat)
   Edit <path>: old_string → new_string

4. Check status
   redit status "<service>:<id>"  # if dirty, continue

5. Update the source system with final content
   final = $(redit read "<service>:<id>")
   <update command>(id, final)

6. Cleanup
   redit drop "<service>:<id>"
```

### Key Naming Convention

AI decides freely, but maintain consistency:
- `<service>:<id>` - basic format
- `<service>:<id>:<version>` - when version/cache distinction needed

Examples:
- `confluence:12345`
- `notion:page-abc-def`
- `confluence:12345:1705312200` (with updated_at)

## Use Cases

### Case 1: Edit Specific Section in Confluence

User: "Update the 'Overview' section in Confluence page 12345"

```bash
# 1. Fetch document
content=$(fetch-confluence-page "12345")

# 2. Store in redit
path=$(echo "$content" | redit init "confluence:12345")
# → /Users/xxx/.redit/abc123/working

# 3. Partial edit (using Edit tool)
# Edit path: "## Overview\nold content" → "## Overview\nnew content"

# 4. Verify changes
redit diff "confluence:12345"

# 5. Commit
final=$(redit read "confluence:12345")
update-confluence-page "12345" "$final"

# 6. Cleanup
redit drop "confluence:12345"
```

### Case 2: Sequential Multi-Section Edits

```bash
# After init
path=$(echo "$content" | redit init "confluence:12345")

# Multiple edits
# Edit: Section 1
# Edit: Section 2
# Edit: Section 3

# Single commit
redit status "confluence:12345"  # dirty
final=$(redit read "confluence:12345")
update-confluence-page(...)
```

### Case 3: Mistake During Editing → Recovery

```bash
# Made a mistake
redit status "confluence:12345"  # dirty

# Restore to original
redit reset "confluence:12345"
redit status "confluence:12345"  # clean

# Start editing again
```

### Case 4: No Changes → Skip

```bash
# Reviewed but made no edits
redit status "confluence:12345"  # clean

# No API call needed - just drop
redit drop "confluence:12345"
```

## Important Notes

1. **Check existing key before init**
   - Error if already exists
   - `drop` first if needed, then `init`

2. **Always drop after commit**
   - Clean up memory/disk
   - Prepare for next edit cycle

3. **Use sufficient context for long documents**
   - Ensure unique match with surrounding context in Edit

4. **AI decides caching strategy**
   - Init with new key when updated_at changes
   - Drop first before reusing same key

## Installation

```bash
curl -fsSL https://raw.githubusercontent.com/bang9/ai-tools/main/redit/install.sh | bash
```

Or build locally:
```bash
make build-cli
```
