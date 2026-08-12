#!/usr/bin/env bash
#
# Installs the Chromium build Playwright pins, plus the system libraries it
# links against.
#
# Deliberately two commands rather than one `playwright install --with-deps`,
# because the halves fail differently. The browser is cached and arrives in
# seconds; the libraries come from `apt-get update`, which applies no transfer
# timeout of its own. A mirror that accepts the connection and then stops
# sending leaves apt waiting indefinitely, so the failure surfaces as a job
# that burns its whole time budget and gets killed, not as a readable error.
# Splitting them also keeps a retry of the apt half from re-downloading ~270 MB
# of browser.
set -euo pipefail

if [ "$(id -u)" -eq 0 ]; then
  SUDO=() # act runs the job as root, where sudo isn't installed
else
  SUDO=(sudo)
fi

# The timeout apt otherwise goes without. A stall now ends in seconds, which is
# also what makes retrying worthwhile — the runners resolve the archive through
# a mirrorlist, so the next attempt can land on a different mirror.
"${SUDO[@]}" tee /etc/apt/apt.conf.d/99-playwright-ci >/dev/null <<'CONF'
Acquire::Retries "3";
Acquire::http::Timeout "20";
Acquire::https::Timeout "20";
CONF

pnpm -C apps/web exec playwright install chromium

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
