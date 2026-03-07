---
name: remote-edit
description: Efficiently edit remote documents (Confluence, Notion, etc.) using local cache. Use this when you need to make partial edits to documents fetched via MCP, avoiding full content regeneration.
argument-hint: "[service:id] [description of changes]"
user-invocable: true
allowed-tools: Bash, Read, Edit
---

# Remote Edit Workflow

You are helping the user edit remote documents efficiently using the redit tool.

## Overview

redit provides a local cache layer for editing remote documents. Instead of regenerating entire documents, you can make partial edits and commit once.

## Available Tools

- `Bash` - Run `redit` commands for init/get/read/status/diff/reset/drop/list
- `Read` - Inspect the working file before or after edits
- `Edit` - Make precise partial modifications to the cached working file

## Workflow

### Step 1: Fetch and Initialize

First, fetch the document content using the appropriate MCP (Atlassian, Notion, etc.):

```
content = mcp__xxx__get_document(id)
```

Then initialize redit with a unique key:

```
path = $(echo "$content" | redit init "service:document-id")
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
redit status "service:document-id" → "dirty" or "clean"
redit diff "service:document-id" → unified diff output
```

If you made a mistake:

```
redit reset "service:document-id" → restore to original
```

### Step 4: Commit

Read the final content and update via MCP:

```
final_content = $(redit read "service:document-id")
mcp__xxx__update_document(id, final_content)
```

### Step 5: Cleanup

Always clean up after committing:

```
redit drop "service:document-id"
```

## Example: Edit Confluence Page Section

User request: "Update the 'Installation' section in Confluence page 12345"

```
1. Fetch: content = mcp__atlassian__get_page(id="12345")
2. Init: path = $(echo "$content" | redit init "confluence:12345")
3. Edit: Edit <path> to update the Installation section
4. Verify: redit diff "confluence:12345"
5. Commit:
   - final = $(redit read "confluence:12345")
   - mcp__atlassian__update_page(id="12345", content=final)
6. Cleanup: redit drop "confluence:12345"
```

## Important Notes

1. **Always use Edit tool** - Don't regenerate entire content
2. **Check status before commit** - Skip API call if clean
3. **Always drop after commit** - Clean up local cache
4. **Use descriptive keys** - Include service and document ID
5. **Handle version conflicts** - Include updated_at in key when needed
