import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import { nitro } from "nitro/vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { devtools } from "@tanstack/devtools-vite";
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
	optimizeDeps: {
		exclude: ["@takumi-rs/core"],
	},
	ssr: {
		external: ["@takumi-rs/core"],
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
			traceDeps: [
				"node_modules/@takumi-rs/core",
				"node_modules/@takumi-rs/core-linux-x64-gnu",
				"node_modules/@takumi-rs/core-linux-x64-musl",
			],
			rollupConfig: {
				external: ["fsevents", /^@takumi-rs\/core/],
				output: {
					paths: (id: string) => {
						if (id.includes("@takumi-rs/core")) {
							const match = id.match(
								/@takumi-rs\/core(-[^/]+)?(\/.*)?$/,
							);
							if (match)
								return `@takumi-rs/core${match[1] || ""}${match[2] || ""}`;
						}
						return id;
					},
				},
			},
		}),
		viteReact(),
		...sentryPlugins,
	],
});
