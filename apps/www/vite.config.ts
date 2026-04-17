import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import { nitro } from "nitro/vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import mdx from "fumadocs-mdx/vite";
import { embedBinaries } from "@workspace/og/vite-plugin";
import * as MdxConfig from "./source.config";

const tslibEsm = fileURLToPath(import.meta.resolve("tslib/tslib.es6.mjs"));
const takumiCoreStub = fileURLToPath(
	import.meta.resolve("@workspace/og/takumi-core-stub"),
);

export default defineConfig({
	server: {
		port: 3001,
	},
	resolve: {
		tsconfigPaths: true,
		alias: {
			"@/": new URL("./src/", import.meta.url).pathname,
			tslib: tslibEsm,
			"@takumi-rs/core": takumiCoreStub,
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
				"@takumi-rs/core": takumiCoreStub,
			},
		}),
		viteReact(),
	],
});
