import { assertRequiredEnv } from "@workspace/config/env";

// Must be the entrypoint's first import, since other modules read env at load time.
try {
	assertRequiredEnv();
} catch (error) {
	console.error("Failed to start worker:", error instanceof Error ? error.message : error);
	process.exit(1);
}
