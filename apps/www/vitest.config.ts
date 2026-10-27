import { defineConfig } from "vitest/config";

// Kept apart from vite.config.ts so unit tests don't boot the Start, Nitro, and MDX plugins.
export default defineConfig({
	resolve: {
		alias: {
			"@/": new URL("./src/", import.meta.url).pathname,
		},
	},
	test: {
		include: ["src/**/*.test.ts"],
	},
});
