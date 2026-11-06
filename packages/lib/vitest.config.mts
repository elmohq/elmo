import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		projects: [
			{
				test: {
					name: "unit",
					include: ["src/**/*.test.ts"],
					exclude: ["src/**/*.integration.test.ts"],
					// The shared db client is built at import time and needs a URL, even
					// for tests that never open a connection.
					env: { DATABASE_URL: "postgres://placeholder/placeholder" },
				},
			},
			{
				test: {
					name: "integration",
					include: ["src/**/*.integration.test.ts"],
					globalSetup: ["src/test/integration/global-setup.ts"],
					// Its own variable rather than DATABASE_URL, which in a dev checkout
					// points at data these tests would write into.
					env: { DATABASE_URL: process.env.TEST_DATABASE_URL ?? "" },
				},
			},
		],
	},
});
