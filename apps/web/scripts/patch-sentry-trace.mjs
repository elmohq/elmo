/**
 * Ensures import-in-the-middle's hook.mjs and its full dependency tree
 * are present in the build output's node_modules.
 *
 * Sentry's @sentry/node calls module.register("import-in-the-middle/hook.mjs", ...)
 * at runtime to set up ESM loader hooks for OpenTelemetry instrumentation. Because
 * this is a string argument (not an import statement), Nitro's file tracer (nft)
 * doesn't detect it and omits hook.mjs and its dependencies from the output.
 *
 * Without these files, module.register() silently fails on Vercel, which means
 * ESM loader hooks are never registered and third-party libraries like pg
 * won't be auto-instrumented by Sentry/OpenTelemetry.
 */

import { cpSync, existsSync, mkdirSync, readdirSync, realpathSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const require = createRequire(import.meta.url);

const iitmPkgJsonPath = require.resolve("import-in-the-middle/package.json");
const iitmDir = dirname(iitmPkgJsonPath);

// In pnpm's virtual store, a package and all its dependencies live as siblings
// under .pnpm/<pkg>@<version>/node_modules/. Walk that directory to collect
// all packages (the package itself + its deps).
const pnpmNodeModules = dirname(iitmDir);
const siblings = readdirSync(pnpmNodeModules);

const packagesToCopy = siblings.map((name) => ({
	name,
	dir: realpathSync(join(pnpmNodeModules, name)),
}));

const outputDirs = [
	".vercel/output/functions/__server.func",
	".output/server",
];

let patched = false;
for (const outputDir of outputDirs) {
	const targetNodeModules = join(outputDir, "node_modules");
	if (!existsSync(targetNodeModules)) continue;

	for (const { name, dir } of packagesToCopy) {
		const dest = join(targetNodeModules, name);
		mkdirSync(dest, { recursive: true });
		cpSync(dir, dest, { recursive: true });
		patched = true;
	}
}

if (patched) {
	const names = packagesToCopy.map((p) => p.name).join(", ");
	console.log(`[patch-sentry-trace] Copied ${names} to build output`);
}
