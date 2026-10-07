#!/usr/bin/env node

/**
 * Tell whether the checked-in SDKs still match what generated them, without
 * running the generator.
 *
 * Regenerating needs the Hey API key, which GitHub withholds from fork and
 * Dependabot PRs. So `pnpm generate:sdk` records a hash of its inputs (the
 * OpenAPI document, hey-api.config.json, and the script that pins the
 * generator) and of its output, and `--check` recomputes both. A PR that
 * changes an input without regenerating, or edits the SDKs by hand, fails;
 * once a maintainer regenerates and pushes, it passes. Runs that have the key
 * still regenerate and compare the real output.
 *
 * Usage:
 *   node scripts/sdk-fingerprint.mjs --check [repo root]
 *   node scripts/sdk-fingerprint.mjs --write [repo root]
 */

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const INPUTS = [
  "packages/api-spec/src/openapi.json",
  "hey-api.config.json",
  "scripts/generate-sdks.mjs",
];
const OUTPUTS = ["packages/sdk-typescript", "packages/sdk-python", ".hey-api"];
const FINGERPRINT = "packages/api-spec/sdk-fingerprint.json";

// Changesets owns the SDK versions and bumps them without regenerating, so
// they are left out of the output hash.
const VERSION_LINES = {
  "packages/sdk-typescript/package.json": /^(\s*"version":\s*)"[^"]*"/m,
  "packages/sdk-python/pyproject.toml": /^(version\s*=\s*)"[^"]*"/m,
};

function hash(root, files) {
  const digest = createHash("sha256");
  for (const file of [...files].sort()) {
    let content = readFileSync(join(root, file), "utf8");
    if (VERSION_LINES[file]) content = content.replace(VERSION_LINES[file], "$1");
    digest.update(`${file}\0${content}\0`);
  }
  return digest.digest("hex");
}

/** Every file in the SDK folders git would commit, tracked or not. */
function outputFiles(root) {
  return execFileSync(
    "git",
    ["ls-files", "--cached", "--others", "--exclude-standard", "-z", "--", ...OUTPUTS],
    { cwd: root, encoding: "utf8" },
  )
    .split("\0")
    .filter((file) => file && file !== FINGERPRINT);
}

export function fingerprint(root) {
  return { inputs: hash(root, INPUTS), outputs: hash(root, outputFiles(root)) };
}

export function writeFingerprint(root) {
  writeFileSync(join(root, FINGERPRINT), `${JSON.stringify(fingerprint(root), null, "\t")}\n`);
}

function check(root) {
  const recorded = JSON.parse(readFileSync(join(root, FINGERPRINT), "utf8"));
  const current = fingerprint(root);
  const problems = [];
  if (recorded.inputs !== current.inputs) {
    problems.push(`The SDKs need regenerating: one of ${INPUTS.join(", ")} changed since they were generated.`);
  }
  if (recorded.outputs !== current.outputs) {
    problems.push("The SDKs differ from what `pnpm generate:sdk` produced. They are generated; don't edit them by hand.");
  }
  return problems;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [mode, root = fileURLToPath(new URL("..", import.meta.url))] = process.argv.slice(2);
  if (mode === "--write") {
    writeFingerprint(root);
  } else if (mode === "--check") {
    const problems = check(root);
    for (const problem of problems) console.error(problem);
    if (problems.length > 0) {
      console.error("Run `pnpm generate:sdk` (needs HEY_API_PKG_TOKEN) and commit the result.");
      process.exit(1);
    }
  } else {
    console.error("Usage: node scripts/sdk-fingerprint.mjs --check|--write [repo root]");
    process.exit(2);
  }
}
