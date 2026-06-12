import { readFileSync } from "node:fs";
import { build } from "rolldown";

const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));

// Runtime dependencies stay external — they're installed from npm alongside
// the published package. Everything else that gets imported (notably the
// unpublishable @workspace/* devDependencies) is bundled into dist/index.js.
await build({
	input: "src/index.ts",
	platform: "node",
	external: Object.keys(pkg.dependencies ?? {}),
	output: {
		format: "esm",
		file: "dist/index.js",
	},
});
