import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import { nitro } from "nitro/vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { devtools } from "@tanstack/devtools-vite";
import { embedBinaries, takumiWasmNitroModule } from "@workspace/og/vite-plugin";
import pkg from "./package.json" with { type: "json" };

const tslibEsm = fileURLToPath(import.meta.resolve("tslib/tslib.es6.mjs"));

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
				// takumi's image-response statically imports native @takumi-rs/core,
				// whose top-level requireNative() crashes at startup in the standalone
				// bundle. The wasm render path only uses two pure-JS resource helpers
				// from that import, which @takumi-rs/helpers also exports.
				"@takumi-rs/core": "@takumi-rs/helpers",
			},
			noExternals: [
				"@opentelemetry/instrumentation",
				"@opentelemetry/api",
				"@prisma/instrumentation",
			],
			modules: [takumiWasmNitroModule()],
			rollupConfig: {
				external: ["fsevents"],
			},
		}),
		viteReact(),
		...sentryPlugins,
	],
});
