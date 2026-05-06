import type { StorybookConfig } from "@storybook/react-vite";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const mocksDir = path.resolve(__dirname, "../src/stories/_mocks");

const config: StorybookConfig = {
	framework: "@storybook/react-vite",
	stories: ["../src/stories/**/*.stories.{ts,tsx}"],
	core: {
		disableTelemetry: true,
	},
	async viteFinal(config) {
		const { mergeConfig } = await import("vite");
		const pkg = await import("../package.json", { with: { type: "json" } });

		return mergeConfig(config, {
			define: {
				__APP_VERSION__: JSON.stringify(pkg.version),
			},
			resolve: {
				tsconfigPaths: true,
				alias: [
					{ find: /^@\/hooks\/use-brands(\.tsx)?$/, replacement: path.resolve(mocksDir, "use-brands.tsx") },
					{ find: /^@\/hooks\/use-auth(\.tsx)?$/, replacement: path.resolve(mocksDir, "use-auth.tsx") },
					{ find: /^@\/hooks\/use-chart-download(\.tsx)?$/, replacement: path.resolve(mocksDir, "use-chart-download.tsx") },
					{ find: /^@\/hooks\/use-chart-export(\.tsx)?$/, replacement: path.resolve(mocksDir, "use-chart-export.tsx") },
					{ find: /^@\/contexts\/chart-data-context(\.tsx)?$/, replacement: path.resolve(mocksDir, "chart-data-context.tsx") },
					{ find: /^@\/lib\/config\/client(\.ts)?$/, replacement: path.resolve(mocksDir, "config-client.ts") },
					{ find: /^@\/server\/onboarding(\.ts)?$/, replacement: path.resolve(mocksDir, "server-onboarding.ts") },
					{ find: /^@\/server\/brands(\.ts)?$/, replacement: path.resolve(mocksDir, "server-brands.ts") },
					{ find: /^@tanstack\/react-router$/, replacement: path.resolve(mocksDir, "tanstack-router.tsx") },
					{ find: /^@\//, replacement: path.resolve(__dirname, "../src") + "/" },
				],
			},
		});
	},
};

export default config;
