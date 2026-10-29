import type { AnalyticsReader } from "@/lib/analytics/reader";
import * as citations from "@/lib/brand-data/memory-citation-reads";
import * as entities from "@/lib/brand-data/memory-entity-reads";
import * as rollups from "@/lib/brand-data/memory-reads";

export const memoryReader: AnalyticsReader = {
	...rollups,
	...citations,
	...entities,
};
