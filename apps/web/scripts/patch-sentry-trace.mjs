/**
 * Ensures import-in-the-middle's hook.mjs (and its dependency create-hook.mjs)
 * are present in the build output's node_modules.
 *
 * Sentry's @sentry/node calls module.register("import-in-the-middle/hook.mjs", ...)
 * at runtime. Because this is a string argument (not an import statement), Nitro's
 * file tracer (nft) doesn't detect it and omits hook.mjs from the output.
 * Without this file, OpenTelemetry's ESM loader hooks can't register, which means
 * third-party libraries like pg won't be auto-instrumented.
 */

import { cpSync, existsSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const require = createRequire(import.meta.url);

const iitmDir = dirname(require.resolve("import-in-the-middle/package.json"));
const filesToCopy = ["hook.mjs", "create-hook.mjs"];

const outputDirs = [
	".vercel/output/functions/__server.func/node_modules/import-in-the-middle",
	".output/server/node_modules/import-in-the-middle",
];

let patched = false;
for (const outputDir of outputDirs) {
	if (!existsSync(outputDir)) continue;

	for (const file of filesToCopy) {
		const src = join(iitmDir, file);
		const dest = join(outputDir, file);
		if (existsSync(src) && !existsSync(dest)) {
			cpSync(src, dest);
			patched = true;
		}
	}

	const srcLib = join(iitmDir, "lib");
	const destLib = join(outputDir, "lib");
	if (existsSync(srcLib)) {
		mkdirSync(destLib, { recursive: true });
		cpSync(srcLib, destLib, { recursive: true });
		patched = true;
	}
}

if (patched) {
	console.log("[patch-sentry-trace] Copied import-in-the-middle hook files to build output");
}
