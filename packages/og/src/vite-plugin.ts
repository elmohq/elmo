import { copyFileSync, mkdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { basename, join } from "node:path";
import type { NitroModule } from "nitro/types";
import type { Plugin } from "vite";

// Satori parses TTF/OTF/WOFF (not WOFF2), so embed the WOFF variants.
const EMBEDDED_BINARIES: Record<string, string> = {
	"virtual:font/titan-one-400": "@fontsource/titan-one/files/titan-one-latin-400-normal.woff",
	"virtual:font/geist-sans-400": "@fontsource/geist-sans/files/geist-sans-latin-400-normal.woff",
	"virtual:font/geist-sans-500": "@fontsource/geist-sans/files/geist-sans-latin-500-normal.woff",
	"virtual:font/geist-mono-400": "@fontsource/geist-mono/files/geist-mono-latin-400-normal.woff",
};

// Two of the OG pipeline's dependencies load a sibling binary off disk, which the JS
// bundlers can't inline: resvg (the rasterizer) is a native addon whose entry `require`s
// a platform-specific `.node`, and harfbuzzjs (Satori's shaper) is an Emscripten module
// that reads its `.wasm` from `__dirname`. Both have to stay external so they resolve at
// runtime from the traced server output, so the app vite configs pass this same list to
// `externalizeBinaryDeps` and to Nitro's `traceDeps`.
export const OG_BINARY_DEPS = ["@resvg/resvg-js", "harfbuzzjs"];

export function externalizeBinaryDeps(): Plugin {
	return {
		name: "externalize-binary-deps",
		enforce: "pre",
		resolveId(id) {
			if (OG_BINARY_DEPS.includes(id)) return { id, external: true };
		},
	};
}

// The dependency tracer only follows JS, so harfbuzzjs reaches the server output without
// the `hb.wasm` its loader reads at init. Put it back once Nitro has written that output.
export function copyBinaryAssets(): NitroModule {
	const require = createRequire(import.meta.url);
	return {
		name: "og-binary-assets",
		setup(nitro) {
			nitro.hooks.hook("compiled", () => {
				const wasm = require.resolve("harfbuzzjs/hb.wasm");
				const dir = join(nitro.options.output.serverDir, "node_modules/harfbuzzjs");
				mkdirSync(dir, { recursive: true });
				copyFileSync(wasm, join(dir, basename(wasm)));
			});
		},
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
