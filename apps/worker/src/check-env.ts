import { assertRequiredEnv } from "@workspace/config/env";

// Imported first by the entrypoint: other modules read env at load time and
// would otherwise fail on the first missing var instead of listing them all.
try {
	assertRequiredEnv();
} catch (error) {
	console.error("Failed to start worker:", error instanceof Error ? error.message : error);
	process.exit(1);
}
