// Tinybird client module for dual-write ingestion
// Uses @chronark/zod-bird for type-safe writes

import { Tinybird } from "@chronark/zod-bird";
import { z } from "zod";

// Initialize Tinybird client
const tb = new Tinybird({
	token: process.env.TINYBIRD_TOKEN!,
	baseUrl: process.env.TINYBIRD_BASE_URL!,
});

// Citation schema for array items
const citationItemSchema = z.object({
	url: z.string(),
	domain: z.string(),
	title: z.string().nullable(),
});

// Define typed data source schemas
// NOTE: Prompt/brand metadata (brand_name, prompt_value, prompt_group_*, prompt_tags, prompt_system_tags)
// is NOT stored here - it should be joined from PostgreSQL at query time since those values can change.
const promptRunSchema = z.object({
	id: z.string(),
	prompt_id: z.string(),
	brand_id: z.string(),
	model_group: z.string(),
	model: z.string(),
	web_search_enabled: z.number(),
	brand_mentioned: z.number(),
	competitors_mentioned: z.array(z.string()),
	web_queries: z.array(z.string()),
	text_content: z.string(),
	raw_output: z.string(), // JSON stringified - stored in same table since ClickHouse is columnar
	citations: z.array(citationItemSchema), // Expanded to citations table via MV
	created_at: z.string(), // DateTime64 as ISO string
	competitor_count: z.number(),
	has_competitor_mention: z.number(),
});

// Type definitions for external use
export type TinybirdPromptRunEvent = z.infer<typeof promptRunSchema>;
export type TinybirdCitationItem = z.infer<typeof citationItemSchema>;

// Type-safe ingestion endpoints
// Only prompt_runs - citations are auto-expanded via materialized view
export const ingestPromptRuns = tb.buildIngestEndpoint({
	datasource: "prompt_runs",
	event: promptRunSchema,
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
