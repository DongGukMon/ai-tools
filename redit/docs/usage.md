# redit Usage

## Installation

```bash
cd ai-tools/redit
go build -o redit ./cmd/redit

# (Optional) Add to PATH
sudo ln -s $(pwd)/redit /usr/local/bin/redit
```

## Command Reference

### init

Reads content from stdin and creates origin and working copy.

```bash
echo "content" | redit init <key>
# Output: working file path
```

- Error if key already exists
- Creates two files: origin and working

### get

Returns the working file path.

```bash
redit get <key>
# Output: /Users/xxx/.redit/hash/working
```

### read

Outputs working file content to stdout.

```bash
redit read <key>
# Output: file content
```

### status

Checks if modified compared to origin.

```bash
redit status <key>
# Output: dirty or clean
```

### diff

Shows difference between origin and working in unified diff format.

```bash
redit diff <key>
# Output: unified diff or "no changes"
```

### reset

Restores working file to origin.

```bash
redit reset <key>
# Output: reset complete
```

### drop

Deletes all files for the key.

```bash
redit drop <key>
# Output: dropped
```

### list

Lists all managed keys.

```bash
redit list
# Output:
# KEY            STATUS  PATH
# confluence:123 dirty   /Users/xxx/.redit/abc/working
# notion:456     clean   /Users/xxx/.redit/def/working
```

## Storage Structure

```
~/.redit/
└── <key-hash>/
    ├── meta.json   # {"key": "...", "created_at": "..."}
    ├── origin      # Original (immutable)
    └── working     # Working copy (Edit target)
```

## Error Handling

| Error | Cause | Solution |
|-------|-------|----------|
| key already exists | Key already initialized | drop first, then init again |
| key not found | Key doesn't exist | Run init first |

## Tips

1. **Use meaningful keys**: `service:id` format recommended
2. **When version distinction needed**: `service:id:version` format
3. **Clean up after work**: Always finish with drop
