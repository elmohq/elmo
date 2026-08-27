#!/usr/bin/env bash
#
# Regenerate the better-auth Drizzle schema from the auth server config.
#
# Usage:  pnpm run generate:auth-schema   (from packages/lib)
#    or:  bash packages/lib/scripts/generate-auth-schema.sh  (from repo root)
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PKG_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
AUTH_CONFIG="$PKG_DIR/src/auth/_cli-helper.ts"
OUTPUT="$PKG_DIR/src/db/schema-auth.ts"
TMP_OUTPUT="/tmp/better-auth-schema-gen.ts"

# The CLI needs a file that default-exports or exports `auth`.
# Our real config exports a factory function, so we use a thin wrapper.
#
# The wrapper constructs auth with every schema-bearing plugin any deployment
# mode injects via CreateAuthOptions.extraPlugins — today that's cloud's
# Stripe billing plugin (subscription table + stripeCustomerId columns). The
# schema-relevant options here (subscription.enabled, organization.enabled)
# must match the runtime construction in packages/cloud/src/billing/plugin.ts.
mkdir -p "$(dirname "$AUTH_CONFIG")"
cat > "$AUTH_CONFIG" <<'EOF'
import { stripe } from "@better-auth/stripe";
import Stripe from "stripe";
import { createAuth } from "./server";

export const auth = createAuth({
	extraPlugins: [
		stripe({
			stripeClient: new Stripe("sk_test_schema_generation"),
			stripeWebhookSecret: "whsec_schema_generation",
			subscription: { enabled: true, plans: [] },
			organization: { enabled: true },
		}),
	],
});
export default auth;
EOF

cleanup() { rm -f "$AUTH_CONFIG" "$TMP_OUTPUT"; }
trap cleanup EXIT

# createAuth() resolves its base URL at construction; no network, no DB.
export APP_URL="${APP_URL:-http://localhost:3000}"
export BETTER_AUTH_SECRET="${BETTER_AUTH_SECRET:-schema-generation}"
export DATABASE_URL="${DATABASE_URL:-postgres://schema:gen@127.0.0.1:5432/gen}"

# The CLI reads table definitions from the better-auth it bundles itself, not
# from the one this package resolves, so `auth` is pinned to an exact version
# in package.json. Bump it in lockstep with better-auth — a mismatch silently
# generates the wrong schema.
echo "[generate-auth-schema] Running better-auth CLI..."
pnpm exec auth generate \
  --config "$AUTH_CONFIG" \
  --output "$TMP_OUTPUT" \
  --yes \
  2>&1

if [ ! -s "$TMP_OUTPUT" ]; then
  echo "[generate-auth-schema] ERROR: CLI produced empty output" >&2
  exit 1
fi

# Prepend our header and write to the real output file
{
cat <<'HEADER'
/**
 * Better-auth Drizzle schema — tables and relations.
 *
 * Generated via:  pnpm run generate:auth-schema
 *
 * The generator emits tables, columns, and relations implied by the plugins
 * in the auth config (the _cli-helper.ts wrapper). Indexes created by the
 * generator are included here; additional indexes added by hand in
 * migrations (e.g. subscription index in 0012) are NOT represented in this
 * file — drizzle-kit snapshots don't see them and would try to drop them on
 * `drizzle-kit push`. They are maintained by their migration files instead.
 *
 * DO NOT EDIT BY HAND. If you add a better-auth plugin that introduces new
 * tables or columns, re-run the generation script and commit the diff. If the
 * new table needs indexes beyond what the generator emits, add them in a new
 * migration — not in this file.
 *
 * One column deserves a warning the generator can't carry: `apikey.metadata` is
 * writable by anyone with a session, by plugin design. Never store anything
 * there that grants access — see readBrandRestriction in
 * apps/web/src/lib/auth/api-auth.ts.
 */
HEADER
cat "$TMP_OUTPUT"
} > "$OUTPUT"

# The CLI formats with Prettier and emits imports unsorted, both of which fail
# `pnpm lint`. Run Biome so the generated file is committable as-is.
pnpm exec biome check --write "$OUTPUT" >/dev/null

echo "[generate-auth-schema] Written $(wc -l < "$OUTPUT") lines to $OUTPUT"
