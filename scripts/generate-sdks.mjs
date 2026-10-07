#!/usr/bin/env node

/**
 * Regenerate the SDK sources in packages/sdk-typescript/src and
 * packages/sdk-python/src/elmohq_sdk from the OpenAPI document with Fern
 * (configured in fern/generators.yml).
 *
 * Fern runs logged out, entirely on this machine: its generators are Docker
 * images, so this needs Docker and stays out of turbo's codegen and `pnpm
 * build`. CI runs it in its own step and fails if the checked-in output
 * differs.
 *
 * Logged out, Fern only writes source files, never package manifests. The
 * package.json, tsconfig.json and pyproject.toml around the sources are ours,
 * and so are their versions.
 *
 * Usage:
 *   pnpm generate:sdk
 */

import { execFileSync } from "node:child_process";
import { rmSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));

const env = {
  ...process.env,
  // Otherwise the CLI swaps itself for whatever version fern.config.json names,
  // fetched with npx, around pnpm's supply-chain controls.
  FERN_NO_VERSION_REDIRECTION: "true",
  FERN_DISABLE_TELEMETRY: "true",
};
// A token switches Fern to its hosted flow; the output must not depend on who
// runs this.
delete env.FERN_TOKEN;

try {
  // --force: the output directories always exist, and Fern otherwise stops to
  // ask before overwriting them.
  execFileSync("pnpm", ["exec", "fern", "generate", "--local", "--force"], {
    cwd: root,
    env,
    stdio: ["ignore", "inherit", "inherit"],
  });
} catch {
  console.error("\nFern failed. It runs its generators in Docker, so check that Docker is running.");
  process.exit(1);
}

// Provenance Fern stamps into the Python output, including the current git
// commit, so it would differ on every commit.
rmSync(new URL("../packages/sdk-python/src/elmohq_sdk/.fern", import.meta.url), {
  recursive: true,
  force: true,
});
