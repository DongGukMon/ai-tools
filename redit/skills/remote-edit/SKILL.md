---
name: remote-edit
description: Efficiently edit remote documents (Confluence, Notion, etc.) using local cache. Use this when you need to make partial edits to documents fetched via MCP, avoiding full content regeneration.
argument-hint: "[service:id] [description of changes]"
user-invocable: true
allowed-tools: Bash, Read, Edit, mcp__redit__init, mcp__redit__get, mcp__redit__read, mcp__redit__status, mcp__redit__diff, mcp__redit__reset, mcp__redit__drop, mcp__redit__list
---

# Remote Edit Workflow

You are helping the user edit remote documents efficiently using the redit tool.

## Overview

redit provides a local cache layer for editing remote documents. Instead of regenerating entire documents, you can make partial edits and commit once.

## Available Tools

- `mcp__redit__init` - Store content locally, returns working file path
- `mcp__redit__get` - Get working file path for an existing key
- `mcp__redit__read` - Read working file content
- `mcp__redit__status` - Check if document is dirty (modified) or clean
- `mcp__redit__diff` - Show changes between original and working copy
- `mcp__redit__reset` - Restore working copy to original
- `mcp__redit__drop` - Remove local cache
- `mcp__redit__list` - List all cached documents

## Workflow

### Step 1: Fetch and Initialize

First, fetch the document content using the appropriate MCP (Atlassian, Notion, etc.):

```
content = mcp__xxx__get_document(id)
```

Then initialize redit with a unique key:

```
path = mcp__redit__init(key="service:document-id", content=content)
```

Key naming convention:
- Basic: `confluence:12345` or `notion:page-abc`
- With version: `confluence:12345:1705312200` (include updated_at for cache invalidation)

### Step 2: Edit

Use the `Edit` tool to make partial modifications to the working file:

```
Edit <path>
old_string: "## Section Title\nOld content here"
new_string: "## Section Title\nNew updated content"
```

You can make multiple edits. Each edit only modifies the specific part you target.

### Step 3: Review Changes

Check what's been modified:

```
mcp__redit__status(key) → "dirty" or "clean"
mcp__redit__diff(key) → unified diff output
```

If you made a mistake:

```
mcp__redit__reset(key) → restore to original
```

### Step 4: Commit

Read the final content and update via MCP:

```
final_content = mcp__redit__read(key)
mcp__xxx__update_document(id, final_content)
```

### Step 5: Cleanup

Always clean up after committing:

```
mcp__redit__drop(key)
```

## Example: Edit Confluence Page Section

User request: "Update the 'Installation' section in Confluence page 12345"

```
1. Fetch: content = mcp__atlassian__get_page(id="12345")
2. Init: path = mcp__redit__init(key="confluence:12345", content=content)
3. Edit: Edit <path> to update the Installation section
4. Verify: mcp__redit__diff("confluence:12345")
5. Commit:
   - final = mcp__redit__read("confluence:12345")
   - mcp__atlassian__update_page(id="12345", content=final)
6. Cleanup: mcp__redit__drop("confluence:12345")
```

## Important Notes

1. **Always use Edit tool** - Don't regenerate entire content
2. **Check status before commit** - Skip API call if clean
3. **Always drop after commit** - Clean up local cache
4. **Use descriptive keys** - Include service and document ID
5. **Handle version conflicts** - Include updated_at in key when needed
