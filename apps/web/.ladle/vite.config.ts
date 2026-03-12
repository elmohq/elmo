import { defineConfig } from "vite";
import viteReact from "@vitejs/plugin-react";
import viteTsConfigPaths from "vite-tsconfig-paths";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";
import pkg from "../package.json" with { type: "json" };

const mocksDir = path.resolve(__dirname, "../src/stories/_mocks");

export default defineConfig({
	define: {
		__APP_VERSION__: JSON.stringify(pkg.version),
	},
	resolve: {
		alias: [
			// Mock specific hook/config modules (order matters — specific before generic)
			{ find: /^@\/hooks\/use-brands(\.tsx)?$/, replacement: path.resolve(mocksDir, "use-brands.tsx") },
			{ find: /^@\/hooks\/use-auth(\.tsx)?$/, replacement: path.resolve(mocksDir, "use-auth.tsx") },
			{ find: /^@\/hooks\/use-chart-download(\.tsx)?$/, replacement: path.resolve(mocksDir, "use-chart-download.tsx") },
			{ find: /^@\/contexts\/chart-data-context(\.tsx)?$/, replacement: path.resolve(mocksDir, "chart-data-context.tsx") },
			{ find: /^@\/lib\/config\/client(\.ts)?$/, replacement: path.resolve(mocksDir, "config-client.ts") },
			// Mock TanStack Router (provides stubs for useRouteContext, Link, etc.)
			{ find: /^@tanstack\/react-router$/, replacement: path.resolve(mocksDir, "tanstack-router.tsx") },
			// Generic @/ alias for everything else
			{ find: /^@\//, replacement: path.resolve(__dirname, "../src") + "/" },
		],
	},
	plugins: [
		viteTsConfigPaths({
			projects: [path.resolve(__dirname, "../tsconfig.json")],
		}),
		tailwindcss(),
		viteReact(),
	],
});