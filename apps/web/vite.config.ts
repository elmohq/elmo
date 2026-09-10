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
		...sentryTanstackStart(),
	],
});
