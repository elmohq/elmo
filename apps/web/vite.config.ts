import { cpSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import { nitro } from "nitro/vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { devtools } from "@tanstack/devtools-vite";
import { embedBinaries } from "@workspace/og/vite-plugin";
import pkg from "./package.json" with { type: "json" };

const tslibEsm = fileURLToPath(import.meta.resolve("tslib/tslib.es6.mjs"));
// OG images are rendered exclusively through takumi's WASM backend (see
// src/routes/api/og — `@takumi-rs/image-response/wasm` with an embedded
// `virtual:takumi-wasm` module). As of takumi 1.8.7 the `image-response/wasm`
// entry statically pulls in `@takumi-rs/core`, whose module top-level eagerly
// loads a platform-native `.node` binding. That binding isn't present in the
// Nitro `.output` bundle (which ships no node_modules), so the server throws
// "Cannot find native binding" on the first render. The only things the WASM
// path actually uses from that import are two pure-JS resource helpers, which
// also live in `@takumi-rs/helpers` (zero deps, no native binding). Alias
// native core to helpers so the native loader is never bundled; the native
// renderer branch stays dead code because a WASM module is always supplied.
const TAKUMI_CORE_WASM_ALIAS = "@takumi-rs/helpers";

// takumi's WASM renderer is loaded at runtime via `import("@takumi-rs/wasm")`
// (marked `@vite-ignore` in takumi-js, so it stays an unbundled external and
// resolves from the server bundle's node_modules). Nitro's dependency trace
// can't follow that dynamic import, so it only copies a partial package and OG
// rendering throws "Cannot find module '@takumi-rs/wasm/dist/export.mjs'" (and
// then its own `@takumi-rs/helpers` import) in the standalone Docker image.
// Copy these two packages (wasm's only runtime dependency is helpers, which has
// no further deps) into the server output after the build so the imports resolve.
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

const sentryPlugins = await (async () => {
	if (process.env.SENTRY_AUTH_TOKEN && process.env.SENTRY_ORG && process.env.SENTRY_PROJECT) {
		const { sentryTanstackStart } = await import("@sentry/tanstackstart-react/vite");
		return [
			sentryTanstackStart({
				org: process.env.SENTRY_ORG,
				project: process.env.SENTRY_PROJECT,
				authToken: process.env.SENTRY_AUTH_TOKEN,
			}),
		];
	}
	return [];
})();

export default defineConfig({
	build: {
		sourcemap: "hidden",
	},
	define: {
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
		devtools(),
		tailwindcss(),
		tanstackStart(),
		nitro({
			sourcemap: true,
			alias: {
				tslib: tslibEsm,
				"@takumi-rs/core": TAKUMI_CORE_WASM_ALIAS,
			},
			noExternals: [
				"@opentelemetry/instrumentation",
				"@opentelemetry/api",
				"@prisma/instrumentation",
			],
			// Register the copy via a module (additive `nitro.hooks.hook`) rather
			// than a config-level `hooks.compiled`: the latter is defu-merged and
			// would replace a preset's own `compiled` hook — e.g. the Vercel preset
			// writes its Build Output API config there, so overriding it breaks the
			// deploy ("No Output Directory").
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
			rollupConfig: {
				external: ["fsevents"],
			},
		}),
		viteReact(),
		...sentryPlugins,
	],
});
