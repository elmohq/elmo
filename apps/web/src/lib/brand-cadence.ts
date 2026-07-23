/**
 * Cadence-only fast path: resolve a brand's effective `run.cadence_hours`
 * without a full target resolution. One indexed query over the selector-less
 * cadence rows in the brand's scope chain (instance + org + brand), merged by
 * scope precedence. Callers that already resolve targets (server/brands.ts)
 * get cadence from the full resolver instead; this exists for the read paths
 * that only ever needed one number (chart smoothing, job scheduling).
 */
import { REGISTRY } from "@workspace/lib/config/registry";
import { db } from "@workspace/lib/db/db";
import { configs } from "@workspace/lib/db/schema";
import { getDefaultDelayHours } from "@workspace/lib/constants";
import { and, eq, isNull, or } from "drizzle-orm";

const CADENCE_KEY = "run.cadence_hours";
const SCOPE_RANK: Record<string, number> = { instance: 0, organization: 1, brand: 2 };

/**
 * Pure merge half, exported for tests: pick the most-specific valid row's
 * value; no row (or only drifted values) falls back to `getDefaultDelayHours()`
 * rather than the registry default so pre-import deployments still honor a
 * DEFAULT_DELAY_HOURS env override (post-import the two agree — the importer
 * seeds an instance row whenever env differs from the code default).
 */
export function mergeCadenceRows(rows: { scope: string; value: unknown }[]): number {
	const schema = REGISTRY[CADENCE_KEY].valueSchema;
	let best: { rank: number; value: number } | null = null;
	for (const row of rows) {
		const rank = SCOPE_RANK[row.scope];
		if (rank === undefined) continue;
		if (!schema.safeParse(row.value).success) continue;
		if (!best || rank > best.rank) best = { rank, value: row.value as number };
	}
	return best ? best.value : getDefaultDelayHours();
}

/** Effective cadence hours for one brand (see module doc). */
export async function resolveBrandCadenceHours(brandId: string, organizationId: string): Promise<number> {
	const rows = await db
		.select({ scope: configs.scope, value: configs.value })
		.from(configs)
		.where(
			and(
				eq(configs.key, CADENCE_KEY),
				isNull(configs.model),
				isNull(configs.targetId),
				or(
					eq(configs.scope, "instance"),
					and(eq(configs.scope, "organization"), eq(configs.organizationId, organizationId)),
					and(eq(configs.scope, "brand"), eq(configs.brandId, brandId)),
				),
			),
		);
	return mergeCadenceRows(rows);
}
