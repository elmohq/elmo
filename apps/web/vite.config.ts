import { fileURLToPath } from "node:url";
import { sentryTanstackStart } from "@sentry/tanstackstart-react/vite";
import tailwindcss from "@tailwindcss/vite";
import { devtools } from "@tanstack/devtools-vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { embedBinaries } from "@workspace/og/vite-plugin";
import { nitro } from "nitro/vite";
import { defineConfig } from "vite";
import pkg from "./package.json" with { type: "json" };

const tslibEsm = fileURLToPath(import.meta.resolve("tslib/tslib.es6.mjs"));

export default defineConfig({
	build: {
		sourcemap: "hidden",
	},
	worker: {
		format: "es",
	},
	define: {
		__APP_VERSION__: JSON.stringify(pkg.version),
	},
	resolve: {
		tsconfigPaths: true,
		alias: {
			"@/": new URL("./src/", import.meta.url).pathname,
			tslib: tslibEsm,
			// DuckDB-WASM ships a build that runs in the calling thread but doesn't export it.
			"duckdb-wasm-blocking": new URL(
				"./node_modules/@duckdb/duckdb-wasm/dist/duckdb-browser-blocking.mjs",
				import.meta.url,
			).pathname,
		},
	},
	plugins: [
		embedBinaries(),
		devtools(),
		tailwindcss(),
		tanstackStart(),
		nitro({
			traceDeps: ["@takumi-rs/core"],
			exportConditions: ["import"],
			sourcemap: true,
			compressPublicAssets: { brotli: true, gzip: true },
			alias: {
				tslib: tslibEsm,
			},
			noExternals: ["@opentelemetry", "@sentry", "@prisma/instrumentation"],
			rollupConfig: {
				external: ["fsevents"],
			},
		}),
		viteReact(),
		// Build-time instrumentation forces `pg` into the bundle, where its
		// `require("pg-pool")` resolves to an ESM namespace instead of the Pool
		// class, and any chunk that imports `pg` directly throws on load.
		...sentryTanstackStart({ buildTimeInstrumentation: false }),
	],
});
