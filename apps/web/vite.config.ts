import { defineConfig } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import { sentryTanstackStart } from "@sentry/tanstackstart-react";
import { nitro } from "nitro/vite";
import viteReact from "@vitejs/plugin-react";
import viteTsConfigPaths from "vite-tsconfig-paths";
import tailwindcss from "@tailwindcss/vite";
import { devtools } from "@tanstack/devtools-vite";
import pkg from "./package.json" with { type: "json" };

const hasSentry =
	process.env.SENTRY_ORG && process.env.SENTRY_PROJECT && process.env.SENTRY_AUTH_TOKEN;

export default defineConfig({
	build: {
		sourcemap: "hidden",
	},
	define: {
		__APP_VERSION__: JSON.stringify(pkg.version),
	},
	resolve: {
		alias: {
			"@/": new URL("./src/", import.meta.url).pathname,
		},
	},
	plugins: [
		devtools(),
		viteTsConfigPaths({
			projects: ["./tsconfig.json"],
		}),
		tailwindcss(),
		tanstackStart(),
		nitro({
			sourcemap: true,
			rollupConfig: {
				external: [
					"fsevents",
					"pg",
					"pg-boss",
					"@clickhouse/client",
					"@sentry/tanstackstart-react",
					"@sentry/node",
					"@opentelemetry/api",
				],
			},
		}),
		viteReact(),
		...(hasSentry
			? [
				sentryTanstackStart({
					org: process.env.SENTRY_ORG!,
					project: process.env.SENTRY_PROJECT!,
					authToken: process.env.SENTRY_AUTH_TOKEN,
					sourcemaps: {
						filesToDeleteAfterUpload: [".output/**/*.map", ".vercel/**/*.map"],
					},
				}),
				]
			: []),
	],
});
