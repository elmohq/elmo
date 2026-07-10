import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import { nitro } from "nitro/vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import mdx from "fumadocs-mdx/vite";
import { embedBinaries, takumiWasmNitroModule } from "@workspace/og/vite-plugin";
import * as MdxConfig from "./source.config";
import pkg from "./package.json" with { type: "json" };

const tslibEsm = fileURLToPath(import.meta.resolve("tslib/tslib.es6.mjs"));

export default defineConfig({
	server: {
		port: 3001,
	},
	define: {
		// Injected from this package's manifest, which shares the fixed
		// workspace release version, so version badges auto-update on release.
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
		mdx(MdxConfig),
		tailwindcss(),
		tanstackStart(),
		nitro({
			alias: {
				tslib: tslibEsm,
				// takumi's image-response statically imports native @takumi-rs/core,
				// whose top-level requireNative() crashes at startup in the standalone
				// bundle. The wasm render path only uses two pure-JS resource helpers
				// from that import, which @takumi-rs/helpers also exports.
				"@takumi-rs/core": "@takumi-rs/helpers",
			},
			modules: [takumiWasmNitroModule()],
			vercel: {
				config: {
					version: 3,
					images: {
						sizes: [640, 750, 828, 1080, 1200, 1920, 2048],
						domains: [],
						minimumCacheTTL: 31536000,
						formats: ["image/webp"],
					},
					// Keeps the README repo-activity snapshot warm in Upstash so
					// `/repo-activity.svg` only ever reads cache. Every 15 min stays
					// well under GitHub's 30/min Search API limit (~14 search calls
					// per refresh).
					crons: [
						{ path: "/api/repo-activity/refresh", schedule: "*/15 * * * *" },
					],
				},
			},
		}),
		viteReact(),
	],
});
