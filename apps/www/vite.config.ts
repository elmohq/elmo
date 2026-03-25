import { defineConfig } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import mdx from "fumadocs-mdx/vite";
import { embedBinaries } from "@workspace/og/vite-plugin";
import * as MdxConfig from "./source.config";

export default defineConfig({
	server: {
		port: 3001,
	},
	resolve: {
		tsconfigPaths: true,
		alias: {
			"@/": new URL("./src/", import.meta.url).pathname,
		},
	},
	plugins: [
		embedBinaries(),
		mdx(MdxConfig),
		tailwindcss(),
		tanstackStart(),
		viteReact(),
	],
});
