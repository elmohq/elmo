import { cpSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { basename, dirname, join, resolve } from "node:path";
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

// Because the OG routes pass a wasm `module` to takumi's ImageResponse,
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
			},
			noExternals: [
				"@opentelemetry/instrumentation",
				"@opentelemetry/api",
				"@prisma/instrumentation",
			],
			traceDeps: ["@takumi-rs/core", ...takumiNativeBindings],
			// Registered as a Nitro module rather than a config-level `compiled`
			// hook: config hooks REPLACE same-named preset hooks (defu merge),
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
			rollupConfig: {
				external: ["fsevents"],
			},
		}),
		viteReact(),
		...sentryPlugins,
	],
});
