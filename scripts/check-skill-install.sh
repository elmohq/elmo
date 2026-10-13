#!/usr/bin/env bash
# Usage: check-skill-install.sh SOURCE LABEL, where SOURCE is a path, owner/repo, or URL.
set -euo pipefail

source="$1"
dir="${RUNNER_TEMP:-/tmp}/skill-install-$2"
rm -rf "$dir" && mkdir -p "$dir" && cd "$dir"
git init -q .

pnpm dlx "${SKILLS_CLI:-skills@1.7.1}" add "$source" --skill aeo --agent claude-code -y

skill=.claude/skills/aeo
for file in SKILL.md scripts/check_ai_access.py \
	references/content.md references/elmo.md references/evidence.md \
	references/measurement.md references/off-site.md references/technical.md; do
	test -s "$skill/$file" || { echo "missing $skill/$file"; exit 1; }
done

python3 - "$skill/SKILL.md" <<'PY'
import re, sys
text = open(sys.argv[1]).read()
front = text.split("---")[1]
name = re.search(r"^name:\s*(.+)$", front, re.M).group(1).strip()
description = re.search(r"^description:\s*(.+)$", front, re.M).group(1).strip()
assert name == "aeo", f"name is {name!r}"
assert 0 < len(description) <= 1024, f"description is {len(description)} characters"
PY

python3 "$skill/scripts/check_ai_access.py" --help > /dev/null
echo "aeo installed from $source"
