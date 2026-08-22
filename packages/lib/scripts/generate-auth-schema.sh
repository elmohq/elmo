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

echo "[generate-auth-schema] Running better-auth CLI..."
echo "y" | pnpm exec better-auth generate \
  --config "$AUTH_CONFIG" \
  --output "$TMP_OUTPUT" \
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
 * Source of truth: npx @better-auth/cli@latest generate
 *
 * DO NOT EDIT BY HAND. If you add/remove better-auth plugins in
 * packages/lib/src/auth/server.ts, re-run the generation script
 * and it will overwrite this file.
 */
HEADER
cat "$TMP_OUTPUT"
} > "$OUTPUT"

echo "[generate-auth-schema] Written $(wc -l < "$OUTPUT") lines to $OUTPUT"
