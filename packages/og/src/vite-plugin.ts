import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import type { Plugin } from "vite";

// Satori parses TTF/OTF/WOFF (not WOFF2), so embed the WOFF variants.
const EMBEDDED_BINARIES: Record<string, string> = {
	"virtual:font/titan-one-400": "@fontsource/titan-one/files/titan-one-latin-400-normal.woff",
	"virtual:font/geist-sans-400": "@fontsource/geist-sans/files/geist-sans-latin-400-normal.woff",
	"virtual:font/geist-sans-500": "@fontsource/geist-sans/files/geist-sans-latin-500-normal.woff",
};

// resvg (the OG rasterizer) is a native addon: its entry `require`s a
// platform-specific `.node` binary the JS bundlers can't inline. Mark it
// external in every build environment so it's resolved at runtime from the
// traced server output (see `traceDeps` in the app vite configs) instead.
export function externalizeResvg(): Plugin {
	return {
		name: "externalize-resvg",
		enforce: "pre",
		resolveId(id) {
			if (id === "@resvg/resvg-js") return { id, external: true };
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
