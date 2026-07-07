import { cpSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { basename, dirname, join, resolve } from "node:path";
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
const require = createRequire(import.meta.url);
const takumiCorePkgPath = resolve(
	dirname(require.resolve("@takumi-rs/core")),
	"..",
	"package.json",
);
const takumiNativeBindings = Object.keys(
	(
		JSON.parse(readFileSync(takumiCorePkgPath, "utf8")) as {
			optionalDependencies?: Record<string, string>;
		}
	).optionalDependencies ?? {},
);

// Because the OG route passes a wasm `module` to takumi's ImageResponse,
// takumi-js does a @vite-ignore'd `import("@takumi-rs/wasm")` at render time
// that Nitro can't trace into the bundle, so the package (and its dependency
// @takumi-rs/helpers) must exist in the server output's node_modules.
const takumiWasmDir = resolve(dirname(require.resolve("@takumi-rs/wasm")), "..");
const takumiWasmRuntimeDeps = [
	takumiWasmDir,
	resolve(
		dirname(createRequire(join(takumiWasmDir, "package.json")).resolve("@takumi-rs/helpers")),
		"..",
	),
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
			},
			traceDeps: ["@takumi-rs/core", ...takumiNativeBindings],
			// Registered as a Nitro module rather than a config-level `compiled`
			// hook: config hooks REPLACE same-named preset hooks (defu merge) —
			// the Vercel preset writes its Build Output config in `compiled` —
			// while modules register additively via hooks.hook().
			modules: [
				(nitroInstance) => {
					nitroInstance.hooks.hook("compiled", (n) => {
						for (const pkgDir of takumiWasmRuntimeDeps) {
							cpSync(
								pkgDir,
								join(n.options.output.serverDir, "node_modules", "@takumi-rs", basename(pkgDir)),
								{ recursive: true, dereference: true },
							);
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
