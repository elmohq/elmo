#!/usr/bin/env bash
#
# Block until every named E2E web container serves requests, then exit.
# Used after `docker compose up` brings the deployment-mode stacks up together
# (see e2e/modes.yaml); each needs the same grace period as a cold start, and
# waiting on them in one pass costs no more than waiting on the slowest.
#
# Usage: bash e2e/wait-for-web.sh [url ...]
set -euo pipefail

URLS=("$@")
if [ ${#URLS[@]} -eq 0 ]; then
  URLS=("http://localhost:1515/")
fi

# Half-second polling: a container that came up in two seconds should not be
# billed for a whole extra interval, four times over.
DEADLINE=$((SECONDS + 180))

for url in "${URLS[@]}"; do
  echo "Waiting for web to be ready on ${url}..."
  until curl -sf -o /dev/null "$url" 2>/dev/null; do
    if [ "$SECONDS" -ge "$DEADLINE" ]; then
      echo "ERROR: ${url} did not become ready in time."
      docker compose logs
      exit 1
    fi
    sleep 0.5
  done
  echo "Ready: ${url}"
done
