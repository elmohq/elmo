import { cpSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { basename, dirname, join, resolve } from "node:path";
import type { Nitro } from "nitro/types";
import type { Plugin } from "vite";

const EMBEDDED_BINARIES: Record<string, string> = {
	"virtual:takumi-wasm":
		"@takumi-rs/wasm/takumi_wasm_bg.wasm",
	"virtual:font/titan-one-400":
		"@fontsource/titan-one/files/titan-one-latin-400-normal.woff2",
	"virtual:font/geist-sans-400":
		"@fontsource/geist-sans/files/geist-sans-latin-400-normal.woff2",
	"virtual:font/geist-sans-500":
		"@fontsource/geist-sans/files/geist-sans-latin-500-normal.woff2",
};

// Because the OG routes pass a wasm `module` to takumi's ImageResponse,
// takumi-js does a @vite-ignore'd `import("@takumi-rs/wasm")` at render time
// that Nitro can't trace into the bundle, so the package (and its dependency
// @takumi-rs/helpers) must exist in the server output's node_modules.
//
// Registered as a Nitro module rather than a config-level `compiled` hook:
// config hooks REPLACE same-named preset hooks (defu merge) — the Vercel
// preset writes its Build Output config in `compiled` — while modules
// register additively via hooks.hook().
export function takumiWasmNitroModule(): (nitro: Nitro) => void {
	const require = createRequire(import.meta.url);
	const wasmDir = resolve(dirname(require.resolve("@takumi-rs/wasm")), "..");
	const helpersDir = resolve(
		dirname(createRequire(join(wasmDir, "package.json")).resolve("@takumi-rs/helpers")),
		"..",
	);
	return (nitroInstance) => {
		nitroInstance.hooks.hook("compiled", (nitro) => {
			for (const pkgDir of [wasmDir, helpersDir]) {
				cpSync(
					pkgDir,
					join(nitro.options.output.serverDir, "node_modules", "@takumi-rs", basename(pkgDir)),
					{ recursive: true, dereference: true },
				);
			}
		});
	};
}

export function embedBinaries(): Plugin {
	const require = createRequire(import.meta.url);
	return {
		name: "embed-binaries",
		resolveId(id) {
			if (id in EMBEDDED_BINARIES) return `\0${id}`;
		},
		load(id) {
			const key = id.startsWith("\0") ? id.slice(1) : id;
			const spec = EMBEDDED_BINARIES[key];
			if (!spec) return;
			const filePath = require.resolve(spec);
			const base64 = readFileSync(filePath).toString("base64");
			return `export default Buffer.from(${JSON.stringify(base64)}, "base64");`;
		},
	};
}
