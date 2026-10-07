#!/usr/bin/env node

/**
 * Regenerate packages/sdk-typescript and packages/sdk-python from the OpenAPI
 * document with Hey API (configured in hey-api.config.json).
 *
 * The generator comes from Hey API's private registry, so this needs a token:
 * HEY_API_PKG_TOKEN in the environment, or `//npm.pkg.heyapi.dev/:_authToken`
 * in your npm config. That is why it stays out of turbo's codegen and `pnpm
 * build`, and only runs when called. CI runs it in its own step and fails if
 * the checked-in output differs. Runs without the key fall back to the
 * fingerprint this writes (see sdk-fingerprint.mjs).
 *
 * Usage:
 *   pnpm generate:sdk
 */

import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { writeFingerprint } from "./sdk-fingerprint.mjs";

// Pinned: the output is checked in, so moving the generator is a regeneration
// PR of its own.
const HEY_API = "hey-api@0.1.0-elmo-demo.1";
const REGISTRY = "https://npm.pkg.heyapi.dev/";

const root = fileURLToPath(new URL("..", import.meta.url));

const env = { ...process.env };
if (process.env.HEY_API_PKG_TOKEN) {
  env["npm_config_//npm.pkg.heyapi.dev/:_authToken"] =
    process.env.HEY_API_PKG_TOKEN;
}

try {
  execFileSync(
    "pnpm",
    [`--config.registry=${REGISTRY}`, "dlx", HEY_API, "generate"],
    { cwd: root, env, stdio: "inherit" },
  );
} catch {
  console.error(
    "\nHey API failed. If it could not be installed, set HEY_API_PKG_TOKEN or " +
      "add `//npm.pkg.heyapi.dev/:_authToken` to your npm config.",
  );
  process.exit(1);
}

execFileSync(
  process.execPath,
  [fileURLToPath(new URL("sync-sdk-versions.mjs", import.meta.url))],
  { stdio: "inherit" },
);

writeFingerprint(root);
