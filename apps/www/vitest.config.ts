import { defineConfig } from "vitest/config";

// Keeps Vitest off vite.config.ts, whose Start, Nitro, and MDX plugins unit tests don't need.
export default defineConfig({
	test: {
		include: ["src/**/*.test.ts"],
	},
});
