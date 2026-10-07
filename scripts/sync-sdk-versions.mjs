#!/usr/bin/env node

/**
 * Give the Python SDK the repo's release version.
 *
 * Changesets owns versions here (one fixed version for every package). It
 * bumps packages/sdk-typescript like any other package, but it never sees
 * pyproject.toml, so `pnpm version-packages` runs this afterwards. The version
 * is read from packages/api-spec, since the SDKs are generated from it.
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

const pyProject = join(root, "packages/sdk-python/pyproject.toml");
const pattern = /^(version\s*=\s*)"[^"]*"/m;
const before = readFileSync(pyProject, "utf8");
if (!pattern.test(before)) {
  throw new Error("packages/sdk-python/pyproject.toml has no version to update.");
}
writeFileSync(pyProject, before.replace(pattern, `$1"${version}"`));
