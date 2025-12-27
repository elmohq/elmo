// Tinybird client module for dual-write ingestion
// Uses @chronark/zod-bird for type-safe writes

import { Tinybird } from "@chronark/zod-bird";
import { z } from "zod";

// Initialize Tinybird client
const tb = new Tinybird({ token: process.env.TINYBIRD_TOKEN! });

// Define typed data source schemas
const promptRunSchema = z.object({
	id: z.string(),
	prompt_id: z.string(),
	brand_id: z.string(),
	brand_name: z.string(),
	prompt_value: z.string(),
	prompt_group_category: z.string().nullable(),
	prompt_group_prefix: z.string().nullable(),
	prompt_tags: z.array(z.string()),
	prompt_system_tags: z.array(z.string()),
	model_group: z.string(),
	model: z.string(),
	web_search_enabled: z.number(),
	brand_mentioned: z.number(),
	competitors_mentioned: z.array(z.string()),
	web_queries: z.array(z.string()),
	text_content: z.string(),
	created_at: z.string(), // DateTime64 as ISO string
	competitor_count: z.number(),
	has_competitor_mention: z.number(),
});

const citationSchema = z.object({
	prompt_run_id: z.string(),
	prompt_id: z.string(),
	brand_id: z.string(),
	model_group: z.string(),
	url: z.string(),
	domain: z.string(),
	title: z.string().nullable(),
	category: z.string(),
	created_at: z.string(), // DateTime64 as ISO string
});

// Type definitions for external use
export type TinybirdPromptRunEvent = z.infer<typeof promptRunSchema>;
export type TinybirdCitationEvent = z.infer<typeof citationSchema>;

// Type-safe ingestion endpoints
export const ingestPromptRuns = tb.buildIngestEndpoint({
	datasource: "prompt_runs",
	event: promptRunSchema,
});

export const ingestCitations = tb.buildIngestEndpoint({
	datasource: "citations",
	event: citationSchema,
});

// Tinybird ingestion result type
type TinybirdIngestResult = { successful_rows: number; quarantined_rows: number };

// Wrapper with feature flag check and error handling
export async function ingestToTinybird<T>(
	ingestFn: (events: T[]) => Promise<TinybirdIngestResult>,
	events: T[],
): Promise<void> {
	if (process.env.TINYBIRD_WRITE_ENABLED !== "true") {
		return;
	}

	if (events.length === 0) {
		return;
	}

	try {
		const result = await ingestFn(events);
		if (result.quarantined_rows > 0) {
			console.warn(`Tinybird: ${result.quarantined_rows} rows quarantined`);
		}
	} catch (error) {
		// Log but don't throw - Tinybird failures shouldn't block PostgreSQL writes
		console.error("Tinybird ingestion failed:", error);
	}
}

// Helper to check if Tinybird write is enabled
export function isTinybirdWriteEnabled(): boolean {
	return process.env.TINYBIRD_TOKEN !== undefined && process.env.TINYBIRD_WRITE_ENABLED === "true";
}

