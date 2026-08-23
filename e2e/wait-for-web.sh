#!/usr/bin/env bash
#
# Block until the E2E web container serves requests, then exit. Used after
# every `docker compose up` of `web` — including the deployment-mode switches,
# where a recreated container needs the same grace period as a cold start.
#
# Usage: bash e2e/wait-for-web.sh [url]
set -euo pipefail

URL="${1:-http://localhost:1515/}"

echo "Waiting for web to be ready on ${URL}..."
for _ in $(seq 1 60); do
  if curl -sf -o /dev/null "$URL" 2>/dev/null; then
    echo "Web is ready."
    exit 0
  fi
  sleep 3
done

echo "ERROR: Web did not become ready in time."
docker compose logs
exit 1
