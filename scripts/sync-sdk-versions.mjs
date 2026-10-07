#!/usr/bin/env node

/**
 * Give the generated SDKs the repo's release version.
 *
 * Changesets owns versions here (one fixed version for every package), not Hey
 * API. Changesets bumps packages/sdk-typescript like any other package, but it
 * never sees pyproject.toml, and a regeneration may write back whatever version
 * Hey API keeps for itself. Both callers run this afterwards: `pnpm
 * version-packages` and `pnpm generate:sdk`.
 *
 * The version is read from packages/api-spec, since the SDKs are generated
 * from it.
 *
 * Usage:
 *   node scripts/sync-sdk-versions.mjs [repo root]
 */

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = process.argv[2] ?? fileURLToPath(new URL("..", import.meta.url));

const { version } = JSON.parse(
  readFileSync(join(root, "packages/api-spec/package.json"), "utf8"),
);

// Rewrites only the version line, so the rest of each file stays byte for byte
// what the generator wrote.
function setVersion(file, pattern) {
  const path = join(root, file);
  const before = readFileSync(path, "utf8");
  if (!pattern.test(before)) {
    throw new Error(`${file} has no version field to update.`);
  }
  writeFileSync(path, before.replace(pattern, `$1"${version}"`));
}

setVersion("packages/sdk-typescript/package.json", /^(\s*"version":\s*)"[^"]*"/m);
setVersion("packages/sdk-python/pyproject.toml", /^(version\s*=\s*)"[^"]*"/m);
