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
			// The OG renderer is a native addon: its entry `require`s a platform-specific
			// `.node` binary no JS bundler can inline, so it has to stay external and be
			// traced into the server output. Its export map declares only `import`, which
			// the tracer won't resolve unless that condition is in the list; `noExternals`
			// keeps the wider condition from pulling the Sentry/OpenTelemetry tree out of
			// the bundle along with it.
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
