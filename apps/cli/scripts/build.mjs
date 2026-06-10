import { readFileSync } from "node:fs";
import { build } from "esbuild";

const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));

// Runtime dependencies stay external — they're installed from npm alongside
// the published package. Everything else that gets imported (notably the
// unpublishable @workspace/* devDependencies) is bundled into dist/index.js.
await build({
	entryPoints: ["src/index.ts"],
	bundle: true,
	platform: "node",
	format: "esm",
	target: "node20",
	outfile: "dist/index.js",
	external: Object.keys(pkg.dependencies ?? {}),
});
