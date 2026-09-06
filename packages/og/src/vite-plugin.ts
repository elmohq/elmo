import { copyFileSync, mkdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import type { Plugin } from "vite";

// Satori parses TTF/OTF/WOFF (not WOFF2), so embed the WOFF variants.
const EMBEDDED_BINARIES: Record<string, string> = {
	"virtual:font/titan-one-400": "@fontsource/titan-one/files/titan-one-latin-400-normal.woff",
	"virtual:font/geist-sans-400": "@fontsource/geist-sans/files/geist-sans-latin-400-normal.woff",
	"virtual:font/geist-sans-500": "@fontsource/geist-sans/files/geist-sans-latin-500-normal.woff",
};

/**
 * Both halves of the OG rasterizer ship code a JS bundler can't inline, and
 * both break in different ways if it tries:
 *   • `@resvg/resvg-js` is a native addon whose entry `require`s a
 *     platform-specific `.node` binary.
 *   • `harfbuzzjs` (satori's text shaper) is Emscripten glue that reads
 *     `__dirname` — undefined in the ESM server bundle — to find `hb.wasm`
 *     beside itself on disk.
 *
 * Keep them external in every build environment and let `traceDeps` copy the
 * real packages into the server output, so both resolve as CJS at runtime.
 */
export const OG_BINARY_DEPS = ["@resvg/resvg-js", "harfbuzzjs"];

export function externalizeOgBinaries(): Plugin {
	return {
		name: "externalize-og-binaries",
		enforce: "pre",
		resolveId(id) {
			if (OG_BINARY_DEPS.some((dep) => id === dep || id.startsWith(`${dep}/`))) return { id, external: true };
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

/**
 * The dep tracer follows `import`/`require`, but harfbuzzjs reaches for its
 * `.wasm` through a path it builds at runtime, so tracing copies the JS and
 * leaves the binary behind. Put it back beside the traced package.
 *
 * Wire this into the nitro plugin's `compiled` hook, which runs once the server
 * output (and its traced `node_modules`) is on disk.
 */
export function copyOgBinaryAssets(nitro: { options: { output: { serverDir: string } } }): void {
	const require = createRequire(import.meta.url);
	const wasm = require.resolve("harfbuzzjs/hb.wasm");
	const dest = join(nitro.options.output.serverDir, "node_modules", "harfbuzzjs", "hb.wasm");
	mkdirSync(dirname(dest), { recursive: true });
	copyFileSync(wasm, dest);
}
