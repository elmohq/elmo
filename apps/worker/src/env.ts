/**
 * Worker environment validation
 * 
 * The worker has some additional requirements beyond the common ones
 * defined in @workspace/config/env. This uses Zod for runtime validation
 * and typed access to environment variables.
 */
import { z } from "zod";

const envSchema = z.object({
	// AI providers
	ANTHROPIC_API_KEY: z.string().min(1, "ANTHROPIC_API_KEY is required"),
	OPENAI_API_KEY: z.string().min(1, "OPENAI_API_KEY is required"),

	// Database
	DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),

	// DataForSEO
	DATAFORSEO_LOGIN: z.string().min(1, "DATAFORSEO_LOGIN is required"),
	DATAFORSEO_PASSWORD: z.string().min(1, "DATAFORSEO_PASSWORD is required"),

	// Environment
	ENVIRONMENT: z.string().min(1, "ENVIRONMENT is required"),

	// Redis - uses Upstash-style env vars for both Upstash and local Docker (via redis-http)
	UPSTASH_REDIS_ENDPOINT: z.string().min(1, "UPSTASH_REDIS_ENDPOINT is required"),
	UPSTASH_REDIS_REST_TOKEN: z.string().min(1, "UPSTASH_REDIS_REST_TOKEN is required"),
	UPSTASH_REDIS_REST_URL: z.string().min(1, "UPSTASH_REDIS_REST_URL is required"),

	// Tinybird
	TINYBIRD_TOKEN: z.string().min(1, "TINYBIRD_TOKEN is required"),
	TINYBIRD_BASE_URL: z.string().min(1, "TINYBIRD_BASE_URL is required"),
	TINYBIRD_WORKSPACE: z.string().min(1, "TINYBIRD_WORKSPACE is required"),
	TINYBIRD_WRITE_ENABLED: z.string().min(1, "TINYBIRD_WRITE_ENABLED is required"),
});

function validateEnv() {
	const result = envSchema.safeParse(process.env);

	if (!result.success) {
		const missingVars = result.error.issues.map((e) => `  - ${e.path.join(".")}: ${e.message}`);
		console.error("❌ Missing required environment variables:\n" + missingVars.join("\n"));
		process.exit(1);
	}

	console.log("✅ All required environment variables are present");
	return result.data;
}

export const env = validateEnv();
