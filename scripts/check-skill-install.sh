#!/usr/bin/env bash
# Usage: check-skill-install.sh SOURCE LABEL, where SOURCE is a path, owner/repo, or URL.
set -euo pipefail

# Smoke-test installs shouldn't count toward the skill's public install numbers.
export DISABLE_TELEMETRY=1

dir="${RUNNER_TEMP:-/tmp}/skill-install-$2"
rm -rf "$dir" && mkdir -p "$dir" && cd "$dir"
git init -q .

pnpm dlx "${SKILLS_CLI:-skills@1.7.1}" add "$1" --skill aeo --agent claude-code -y

for file in SKILL.md scripts/check_ai_access.py \
	references/content.md references/elmo.md references/evidence.md \
	references/measurement.md references/off-site.md references/technical.md; do
	test -s ".claude/skills/aeo/$file" || { echo "missing $file"; exit 1; }
done
echo "aeo installed from $1"
