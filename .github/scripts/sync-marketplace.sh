#!/bin/bash
set -e

# Generates .claude-plugin/marketplace.json from individual plugin.json files.
# Requires jq.

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
OUTPUT="$REPO_ROOT/.claude-plugin/marketplace.json"
VERSION="${1:-}"

if [ -z "$VERSION" ] && [ -f "$OUTPUT" ]; then
    VERSION="$(jq -r '.metadata.version // empty' "$OUTPUT")"
fi

if [ -z "$VERSION" ]; then
    first_plugin="$(find "$REPO_ROOT" -path '*/.claude-plugin/plugin.json' -type f | sort | head -1)"
    if [ -n "$first_plugin" ]; then
        VERSION="$(jq -r '.version // empty' "$first_plugin")"
    fi
fi

if [ -z "$VERSION" ]; then
    VERSION="1.0.0"
fi

plugins="[]"

# Category mapping (not stored in plugin.json to avoid validation errors)
get_category() {
    case "$1" in
        claude-irc) echo "collaboration" ;;
        *)          echo "productivity" ;;
    esac
}

for plugin_json in "$REPO_ROOT"/*/.claude-plugin/plugin.json; do
    [ -f "$plugin_json" ] || continue

    plugin_dir="$(dirname "$(dirname "$plugin_json")")"
    plugin_name="$(basename "$plugin_dir")"
    source_rel="./$plugin_name"
    category="$(get_category "$plugin_name")"

    entry=$(jq -c --arg source "$source_rel" --arg category "$category" '{
        name: .name,
        source: $source,
        description: .description,
        version: .version,
        author: { name: .author.name },
        repository: .repository,
        license: .license,
        keywords: .keywords,
        category: $category
    }' "$plugin_json")

    # Skip plugins with null required fields (non-marketplace entries)
    has_nulls=$(echo "$entry" | jq '[.author.name, .repository, .license, .keywords] | any(. == null)')
    if [ "$has_nulls" = "true" ]; then
        continue
    fi

    plugins=$(echo "$plugins" | jq --argjson entry "$entry" '. + [$entry]')
done

# Sort plugins by name for stable output
plugins=$(echo "$plugins" | jq 'sort_by(.name)')

jq -n \
    --argjson plugins "$plugins" \
    --arg version "$VERSION" \
    '{
        name: "ai-tools",
        owner: {
            name: "Airen Kang",
            email: "bang9@users.noreply.github.com"
        },
        metadata: {
            description: "A collection of tools for Claude Code to operate more efficiently",
            version: $version
        },
        plugins: $plugins
    }' > "$OUTPUT"

echo "Generated $OUTPUT with $(echo "$plugins" | jq length) plugin(s)"
