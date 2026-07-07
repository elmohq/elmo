import { cpSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import { nitro } from "nitro/vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import mdx from "fumadocs-mdx/vite";
import { embedBinaries } from "@workspace/og/vite-plugin";
import * as MdxConfig from "./source.config";
import pkg from "./package.json" with { type: "json" };

const tslibEsm = fileURLToPath(import.meta.resolve("tslib/tslib.es6.mjs"));
// OG images (src/routes/og[.]png) render exclusively through takumi's WASM
// backend. As of takumi 1.8.7 the `@takumi-rs/image-response/wasm` entry
// statically pulls in `@takumi-rs/core`, whose module top-level eagerly loads a
// platform-native `.node` binding that isn't present in the Nitro server bundle
// (no node_modules) — crashing OG rendering. The WASM path only uses two pure-JS
// resource helpers from that import, which also live in `@takumi-rs/helpers`
// (zero deps, no native binding). Alias native core to helpers so the native
// loader is never bundled; the native renderer branch is dead code because a
// WASM module is always supplied. See apps/web/vite.config.ts for the twin fix.
const TAKUMI_CORE_WASM_ALIAS = "@takumi-rs/helpers";

// takumi's WASM renderer is loaded at runtime via `import("@takumi-rs/wasm")`
// (marked `@vite-ignore` in takumi-js, so it stays an unbundled external).
// Nitro's dependency trace can't follow that dynamic import, so copy the package
// (and its only runtime dep, `@takumi-rs/helpers`) into the server output after
// the build so the imports resolve.
const require = createRequire(import.meta.url);
const pkgRootDir = (id: string, fromDir?: string) =>
	resolve(
		dirname((fromDir ? createRequire(join(fromDir, "package.json")) : require).resolve(id)),
		"..",
	);
const takumiWasmPkgDir = pkgRootDir("@takumi-rs/wasm");
const takumiRuntimePkgs = [
	{ name: "@takumi-rs/wasm", dir: takumiWasmPkgDir },
	{ name: "@takumi-rs/helpers", dir: pkgRootDir("@takumi-rs/helpers", takumiWasmPkgDir) },
];

export default defineConfig({
	server: {
		port: 3001,
	},
	define: {
		// Injected from this package's manifest, which shares the fixed
		// workspace release version, so version badges auto-update on release.
		__APP_VERSION__: JSON.stringify(pkg.version),
	},
	resolve: {
		tsconfigPaths: true,
		alias: {
			"@/": new URL("./src/", import.meta.url).pathname,
			tslib: tslibEsm,
		},
	},
	plugins: [
		embedBinaries(),
		mdx(MdxConfig),
		tailwindcss(),
		tanstackStart(),
		nitro({
			alias: {
				tslib: tslibEsm,
				"@takumi-rs/core": TAKUMI_CORE_WASM_ALIAS,
			},
			// Register the copy via a module (additive `nitro.hooks.hook`) rather
			// than a config-level `hooks.compiled`: the latter is defu-merged and
			// would replace the Vercel preset's own `compiled` hook, which writes
			// the Build Output API config — overriding it breaks the deploy with
			// "No Output Directory named dist".
			modules: [
				(nitro) => {
					nitro.hooks.hook("compiled", (n) => {
						for (const { name, dir } of takumiRuntimePkgs) {
							cpSync(dir, join(n.options.output.serverDir, "node_modules", ...name.split("/")), {
								recursive: true,
								dereference: true,
							});
						}
					});
				},
			],
			vercel: {
				config: {
					version: 3,
					images: {
						sizes: [640, 750, 828, 1080, 1200, 1920, 2048],
						domains: [],
						minimumCacheTTL: 31536000,
						formats: ["image/webp"],
					},
				},
			},
		}),
		viteReact(),
	],
});
