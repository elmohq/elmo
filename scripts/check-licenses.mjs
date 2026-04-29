#!/usr/bin/env node

/**
 * License compliance checker for the Elmo monorepo.
 *
 * Ensures every dependency uses a license compatible with distributing
 * Elmo itself under AGPL-3.0-or-later. Runs `pnpm licenses list --json`
 * and validates the output against an allow-list of SPDX identifiers plus
 * a set of per-package exceptions for known-safe outliers. The allow-list
 * is intentionally limited to permissive licenses so that, if we ever
 * relicense a subset of the codebase (e.g. an SDK) under MIT, every
 * dependency is already compatible with both AGPL and MIT.
 *
 * Exit codes:
 *   0 – all packages pass
 *   1 – one or more packages have disallowed licenses
 */

import { execSync } from "node:child_process";

// ── Allowed SPDX license identifiers ────────────────────────────────
// These are all permissive licenses, compatible with AGPL-3.0-or-later
// and also MIT (so an SDK package can be relicensed under MIT without
// pulling in incompatible deps). GPL/LGPL/AGPL deps are intentionally NOT
// added here even though they would be AGPL-compatible — the dual-target
// constraint is what keeps the allow-list strict.
const ALLOWED_LICENSES = new Set([
  "MIT",
  "MIT-0",
  "MIT License",
  "ISC",
  "BSD-2-Clause",
  "BSD-3-Clause",
  "0BSD",
  "Apache-2.0",
  "BlueOak-1.0.0",
  "CC0-1.0",
  "Unlicense",
  // Compound expressions where every component is permissive
  "(MIT OR Apache-2.0)",
  "MIT OR Apache-2.0",
  "(MIT OR CC0-1.0)",
  "(MIT AND Zlib)",
  "MIT AND ISC",
  "(AFL-2.1 OR BSD-3-Clause)",
  "(BSD-3-Clause OR GPL-2.0)", // dual-licensed – we use BSD-3-Clause
  "(MPL-2.0 OR Apache-2.0)", // dual-licensed – we use Apache-2.0
]);

// ── Per-package exceptions ───────────────────────────────────────────
// Packages whose licenses are NOT in the allow-list above but are
// acceptable for documented reasons. Keep this list small and justified.
const PACKAGE_EXCEPTIONS = new Map([
  // Sentry CLI – build-time tooling only, never distributed with Elmo.
  // FSL-1.1-MIT converts to MIT after two years.
  ["@sentry/cli", "FSL-1.1-MIT"],
  ["@sentry/cli-darwin-arm64", "FSL-1.1-MIT"],
  ["@sentry/cli-darwin-x64", "FSL-1.1-MIT"],
  ["@sentry/cli-linux-arm", "FSL-1.1-MIT"],
  ["@sentry/cli-linux-arm64", "FSL-1.1-MIT"],
  ["@sentry/cli-linux-x64", "FSL-1.1-MIT"],
  ["@sentry/cli-win32-i686", "FSL-1.1-MIT"],
  ["@sentry/cli-win32-x64", "FSL-1.1-MIT"],

  // lightningcss – build-time CSS compiler. MPL-2.0 is file-level copyleft;
  // we don't modify it, and it's a build tool whose output is not covered.
  ["lightningcss", "MPL-2.0"],
  ["lightningcss-darwin-arm64", "MPL-2.0"],
  ["lightningcss-darwin-x64", "MPL-2.0"],
  ["lightningcss-linux-arm-gnueabihf", "MPL-2.0"],
  ["lightningcss-linux-arm64-gnu", "MPL-2.0"],
  ["lightningcss-linux-arm64-musl", "MPL-2.0"],
  ["lightningcss-linux-x64-gnu", "MPL-2.0"],
  ["lightningcss-linux-x64-musl", "MPL-2.0"],
  ["lightningcss-win32-arm64-msvc", "MPL-2.0"],
  ["lightningcss-win32-x64-msvc", "MPL-2.0"],

  // Web fonts – OFL-1.1 permits bundling in web applications.
  ["@fontsource/geist-sans", "OFL-1.1"],
  ["@fontsource/titan-one", "OFL-1.1"],

  // caniuse browser-compat data – CC-BY-4.0 requires attribution only.
  ["caniuse-lite", "CC-BY-4.0"],

  // argparse – Python-2.0 is a permissive license (PSF variant).
  ["argparse", "Python-2.0"],

  // Packages with "Unknown" in pnpm but verified MIT via LICENSE file.
  ["khroma", "Unknown"],
  ["spawndamnit", "Unknown"],
]);

// ─────────────────────────────────────────────────────────────────────

function run() {
  console.log("Running pnpm licenses list --json ...\n");

  let raw;
  try {
    raw = execSync("pnpm licenses list --json", {
      encoding: "utf-8",
      maxBuffer: 50 * 1024 * 1024,
    });
  } catch (err) {
    console.error("Failed to run pnpm licenses list:", err.message);
    process.exit(1);
  }

  const data = JSON.parse(raw);

  let totalPackages = 0;
  const violations = [];

  for (const [license, packages] of Object.entries(data)) {
    for (const pkg of packages) {
      totalPackages++;
      const name = pkg.name;

      if (ALLOWED_LICENSES.has(license)) {
        continue;
      }

      const exception = PACKAGE_EXCEPTIONS.get(name);
      if (exception === license) {
        continue;
      }

      violations.push({ name, versions: pkg.versions, license });
    }
  }

  console.log(`Scanned ${totalPackages} packages.\n`);

  if (violations.length === 0) {
    console.log("All dependency licenses are compliant.");
    process.exit(0);
  }

  console.error(
    `Found ${violations.length} package(s) with disallowed licenses:\n`,
  );
  for (const v of violations) {
    console.error(`  ${v.name}@${v.versions.join(", ")}  →  ${v.license}`);
  }
  console.error(
    "\nTo resolve: either add the license to ALLOWED_LICENSES or add a",
  );
  console.error(
    "per-package exception (with justification) to PACKAGE_EXCEPTIONS",
  );
  console.error("in scripts/check-licenses.mjs.");
  process.exit(1);
}

run();
