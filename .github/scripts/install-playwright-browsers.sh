#!/usr/bin/env bash
#
# Installs the Chromium build Playwright pins, and its system libraries only if
# the runner is actually missing them.
#
# Deliberately not `playwright install --with-deps`. That bolts an `apt-get
# update` onto every browser install, and apt sets no transfer timeout of its
# own: a mirror that accepts the connection and then stops sending leaves it
# waiting indefinitely. The failure surfaces as a job that burns its whole time
# budget and gets killed, not as an error anyone can read.
set -euo pipefail

pnpm -C apps/web exec playwright install chromium

# Runner images already carry Chromium's libraries, so this normally returns
# before apt is involved at all. --dry-run simulates against the package lists
# already on disk and exits non-zero only if something is genuinely missing.
if pnpm -C apps/web exec playwright install-deps chromium --dry-run; then
  exit 0
fi

# act runs the job as root, where sudo isn't installed.
if [ "$(id -u)" -eq 0 ]; then
  SUDO=()
else
  SUDO=(sudo)
fi

"${SUDO[@]}" tee /etc/apt/apt.conf.d/99-playwright-ci >/dev/null <<'CONF'
Acquire::Retries "3";
Acquire::http::Timeout "20";
Acquire::https::Timeout "20";
CONF

# A stalled mirror now fails in seconds instead of hanging, which makes it worth
# asking again — the retry usually lands on a different mirror.
for attempt in 1 2 3; do
  if pnpm -C apps/web exec playwright install-deps chromium; then
    exit 0
  fi
  echo "::warning::playwright install-deps failed (attempt ${attempt}/3)"
  if [ "$attempt" -lt 3 ]; then
    sleep $((attempt * 15))
  fi
done

echo "::error::playwright install-deps failed after 3 attempts."
exit 1
