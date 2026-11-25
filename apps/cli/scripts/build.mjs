import { readFileSync } from "node:fs";
import { build } from "rolldown";

const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));

// Runtime dependencies install from npm with the package; the unpublishable
// @workspace/* packages have to be bundled.
await build({
	input: "src/index.ts",
	platform: "node",
	external: Object.keys(pkg.dependencies ?? {}),
	output: {
		format: "esm",
		file: "dist/index.js",
	},
});
