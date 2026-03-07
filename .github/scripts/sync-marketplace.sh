#!/bin/bash
set -e

# Generates .claude-plugin/marketplace.json from individual plugin.json files.
# Requires jq.

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
OUTPUT="$REPO_ROOT/.claude-plugin/marketplace.json"

plugins="[]"

for plugin_json in "$REPO_ROOT"/*/.claude-plugin/plugin.json; do
    [ -f "$plugin_json" ] || continue

    plugin_dir="$(dirname "$(dirname "$plugin_json")")"
    source_rel="./$(basename "$plugin_dir")"

    entry=$(jq -c --arg source "$source_rel" '{
        name: .name,
        source: $source,
        description: .description,
        version: .version,
        author: { name: .author.name },
        repository: .repository,
        license: .license,
        keywords: .keywords,
        category: .category
    }' "$plugin_json")

    plugins=$(echo "$plugins" | jq --argjson entry "$entry" '. + [$entry]')
done

# Sort plugins by name for stable output
plugins=$(echo "$plugins" | jq 'sort_by(.name)')

jq -n \
    --argjson plugins "$plugins" \
    '{
        name: "ai-tools",
        owner: {
            name: "Airen Kang",
            email: "bang9@users.noreply.github.com"
        },
        metadata: {
            description: "A collection of tools for Claude Code to operate more efficiently",
            version: "1.0.0"
        },
        plugins: $plugins
    }' > "$OUTPUT"

echo "Generated $OUTPUT with $(echo "$plugins" | jq length) plugin(s)"
