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

// The browser bundle can't read the server's environment at runtime, so the values the server
// reports to Sentry with are fixed here at build time.
const sentryEnvironment = process.env.ENVIRONMENT || "";
const sentryTracesSampleRate = Number.parseFloat(process.env.SENTRY_TRACES_SAMPLE_RATE ?? "");

export default defineConfig({
	build: {
		sourcemap: "hidden",
	},
	define: {
		__APP_VERSION__: JSON.stringify(pkg.version),
		"import.meta.env.VITE_SENTRY_ENVIRONMENT": JSON.stringify(sentryEnvironment),
		"import.meta.env.VITE_SENTRY_TRACES_SAMPLE_RATE": JSON.stringify(
			sentryTracesSampleRate >= 0 && sentryTracesSampleRate <= 1 ? sentryTracesSampleRate : 1,
		),
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
			traceDeps: ["@takumi-rs/core"],
			exportConditions: ["import"],
			sourcemap: true,
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
