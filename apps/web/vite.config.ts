import { fileURLToPath } from "node:url";
import { sentryTanstackStart } from "@sentry/tanstackstart-react/vite";
import tailwindcss from "@tailwindcss/vite";
import { devtools } from "@tanstack/devtools-vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { copyOgBinaryAssets, embedBinaries, externalizeOgBinaries, OG_BINARY_DEPS } from "@workspace/og/vite-plugin";
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
		externalizeOgBinaries(),
		devtools(),
		tailwindcss(),
		tanstackStart(),
		nitro({
			traceDeps: OG_BINARY_DEPS,
			hooks: { compiled: copyOgBinaryAssets },
			sourcemap: true,
			alias: {
				tslib: tslibEsm,
			},
			noExternals: ["@opentelemetry/instrumentation", "@opentelemetry/api", "@prisma/instrumentation"],
			rollupConfig: {
				external: ["fsevents"],
			},
		}),
		viteReact(),
		...sentryTanstackStart(),
	],
});
