#!/bin/sh
# PreToolUse hook: only allow read-only Vercel MCP tools.
tool=$(grep -oE '"tool_name" *: *"[^"]+"' | sed -E 's/.*"([^"]+)"$/\1/')
name=${tool#mcp__vercel__}
case "$name" in
  get_access_to_vercel_url|get_project_deletion_link) ;;
  get_*|list_*|read_*|search_*|count_*|aggregate_*|filter_*|artifact_query|git_namespaces|web_fetch_vercel_url|create_observability_query) exit 0 ;;
esac
echo "Blocked: $tool is not on the read-only Vercel MCP allowlist." >&2
exit 2
