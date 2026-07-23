import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import { sentryTanstackStart } from "@sentry/tanstackstart-react/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import { nitro } from "nitro/vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { devtools } from "@tanstack/devtools-vite";
import { embedBinaries } from "@workspace/og/vite-plugin";
import pkg from "./package.json" with { type: "json" };

const tslibEsm = fileURLToPath(import.meta.resolve("tslib/tslib.es6.mjs"));

// takumi's native backend statically references `@takumi-rs/wasm/node`, which
// eagerly reads a WASM asset we never emit; stub it out (see the stub for why).
const takumiWasmNodeStub = fileURLToPath(import.meta.resolve("@workspace/og/takumi-wasm-node-stub"));

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
			exportConditions: ["node", "import", "default", "!unwasm"],
			traceDeps: ["@takumi-rs/core"],
			sourcemap: true,
			alias: {
				tslib: tslibEsm,
				"@takumi-rs/wasm/node": takumiWasmNodeStub,
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
