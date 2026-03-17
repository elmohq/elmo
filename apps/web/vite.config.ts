import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import { nitro } from "nitro/vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { devtools } from "@tanstack/devtools-vite";
import pkg from "./package.json" with { type: "json" };

const tslibEsm = fileURLToPath(import.meta.resolve("tslib/tslib.es6.mjs"));

const takumiCoreDir = dirname(fileURLToPath(import.meta.resolve("@takumi-rs/core")));
const takumiCorePkg = JSON.parse(readFileSync(join(takumiCoreDir, "package.json"), "utf-8"));
const takumiTraceInclude = Object.keys(takumiCorePkg.optionalDependencies ?? {});

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
		devtools(),
		tailwindcss(),
		tanstackStart(),
		nitro({
			sourcemap: true,
			alias: {
				tslib: tslibEsm,
			},
			// @ts-expect-error -- externals is valid NitroConfig but not typed in NitroPluginConfig
			externals: {
				external: ["@takumi-rs/core"],
				traceInclude: takumiTraceInclude,
			},
			rollupConfig: {
				external: ["fsevents"],
			},
		}),
		viteReact(),
		...sentryPlugins,
	],
});
