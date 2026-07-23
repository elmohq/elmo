/**
 * The config resolver — thin DB layer. Fetches catalog / config rows /
 * entitlements / pool counts and hands them to the pure core (resolve-core.ts).
 *
 * The instance catalog and instance-scope config rows are cached in-process for
 * 60s (they change rarely and every resolution reads them); org/brand/prompt
 * rows are fetched per call. `clearConfigCache()` forces a refresh — used by
 * tests and by the worker after it edits instance config.
 */
import { ASSIGNABLE_MODELS } from "@workspace/config/plans";
import { and, count, eq, inArray, isNull, or, type SQL, sql } from "drizzle-orm";
import { db } from "../db/db";
import { brands, type Config, configs, type ModelTarget, modelTargets, prompts } from "../db/schema";
import { getProvider } from "../providers";
import { type Entitlements, getEntitlements } from "./entitlements";
import {
	type CatalogTarget,
	type ConfigRow,
	type EffectiveTarget,
	type EffectiveTargetsResult,
	type ExcludedTarget,
	resolveEffectiveTargets,
} from "./resolve-core";

export * from "./resolve-core";

const CACHE_TTL_MS = 60_000;
const CLAUDE = ASSIGNABLE_MODELS[0];

let catalogCache: { at: number; value: CatalogTarget[] } | null = null;
let instanceRowsCache: { at: number; value: ConfigRow[] } | null = null;

/** Drop the instance catalog + instance-row caches (tests, worker force-refresh). */
export function clearConfigCache(): void {
	catalogCache = null;
	instanceRowsCache = null;
}

function toCatalogTarget(row: ModelTarget): CatalogTarget {
	return {
		id: row.id,
		model: row.model,
		provider: row.provider,
		version: row.version,
		webSearch: row.webSearch,
		enabled: row.enabled,
		priority: row.priority,
		requiredEntitlement: row.requiredEntitlement,
	};
}

function toConfigRow(row: Config): ConfigRow {
	return {
		id: row.id,
		scope: row.scope,
		organizationId: row.organizationId,
		brandId: row.brandId,
		promptId: row.promptId,
		model: row.model,
		targetId: row.targetId,
		key: row.key,
		value: row.value,
	};
}

/** Select `configs` rows matching a predicate and map them to the pure-core shape. */
async function selectConfigRows(where: SQL | undefined): Promise<ConfigRow[]> {
	const rows = await db.select().from(configs).where(where);
	return rows.map(toConfigRow);
}

/** The instance-wide catalog (`model_targets` with a null org). Cached 60s. */
export async function getInstanceCatalog(): Promise<CatalogTarget[]> {
	if (catalogCache && Date.now() - catalogCache.at < CACHE_TTL_MS) return catalogCache.value;
	const rows = await db.select().from(modelTargets).where(isNull(modelTargets.organizationId));
	const value = rows.map(toCatalogTarget);
	catalogCache = { at: Date.now(), value };
	return value;
}

async function getInstanceRows(): Promise<ConfigRow[]> {
	if (instanceRowsCache && Date.now() - instanceRowsCache.at < CACHE_TTL_MS) return instanceRowsCache.value;
	const rows = await db.select().from(configs).where(eq(configs.scope, "instance"));
	const value = rows.map(toConfigRow);
	instanceRowsCache = { at: Date.now(), value };
	return value;
}

/**
 * The single §3a cascade query: instance + this org + (optionally) this brand +
 * (optionally) this prompt, in one round trip. Used for debug/effective-config
 * views; the resolve* helpers below take the cached instance-row fast path.
 */
export async function fetchConfigRows(ref: {
	organizationId: string;
	brandId?: string;
	promptId?: string;
}): Promise<ConfigRow[]> {
	const clauses = [
		eq(configs.scope, "instance"),
		and(eq(configs.scope, "organization"), eq(configs.organizationId, ref.organizationId)),
	];
	if (ref.brandId) clauses.push(and(eq(configs.scope, "brand"), eq(configs.brandId, ref.brandId)));
	if (ref.promptId) clauses.push(and(eq(configs.scope, "prompt"), eq(configs.promptId, ref.promptId)));
	return selectConfigRows(or(...clauses));
}

async function fetchOrgAndBrandRows(organizationId: string, brandId: string): Promise<ConfigRow[]> {
	return selectConfigRows(
		or(
			and(eq(configs.scope, "organization"), eq(configs.organizationId, organizationId)),
			and(eq(configs.scope, "brand"), eq(configs.brandId, brandId)),
		),
	);
}

async function fetchPromptRows(promptId: string): Promise<ConfigRow[]> {
	return selectConfigRows(and(eq(configs.scope, "prompt"), eq(configs.promptId, promptId)));
}

/** Config rows grouped by scope so the pure core can run per brand without more queries. */
export interface BatchConfigRows {
	instanceRows: ConfigRow[];
	orgRows: Map<string, ConfigRow[]>;
	brandRows: Map<string, ConfigRow[]>;
}

function pushGrouped(map: Map<string, ConfigRow[]>, key: string, row: ConfigRow): void {
	const list = map.get(key);
	if (list) list.push(row);
	else map.set(key, [row]);
}

/**
 * Batch variant for maintenance / `getBrands` (A8d): fetch every org- and
 * brand-scope row for the given ids in two IN-lists (one query) plus the cached
 * instance rows, grouped so a per-brand resolve needs no further round trips.
 */
export async function fetchConfigRowsForBrands(
	organizationIds: string[],
	brandIds: string[],
): Promise<BatchConfigRows> {
	const instanceRows = await getInstanceRows();
	const orgRows = new Map<string, ConfigRow[]>();
	const brandRows = new Map<string, ConfigRow[]>();
	if (organizationIds.length === 0 && brandIds.length === 0) return { instanceRows, orgRows, brandRows };

	const clauses: (SQL | undefined)[] = [];
	if (organizationIds.length > 0) {
		clauses.push(and(eq(configs.scope, "organization"), inArray(configs.organizationId, organizationIds)));
	}
	if (brandIds.length > 0) {
		clauses.push(and(eq(configs.scope, "brand"), inArray(configs.brandId, brandIds)));
	}
	const rows = await selectConfigRows(or(...clauses));
	for (const row of rows) {
		if (row.scope === "organization" && row.organizationId) pushGrouped(orgRows, row.organizationId, row);
		else if (row.scope === "brand" && row.brandId) pushGrouped(brandRows, row.brandId, row);
	}
	return { instanceRows, orgRows, brandRows };
}

/** Assemble the instance + org + brand row set for one brand from a batch fetch. */
export function configRowsForBrand(batch: BatchConfigRows, organizationId: string, brandId: string): ConfigRow[] {
	return [...batch.instanceRows, ...(batch.orgRows.get(organizationId) ?? []), ...(batch.brandRows.get(brandId) ?? [])];
}

/**
 * The §3a Claude-pool count: enabled prompts in the org with an assignable-model
 * `run.model_mode` assignment (value `base` or `web`), joined through prompts →
 * brands (A5). Disabled prompts don't consume the pool.
 */
export async function countAssignableModelUsage(organizationId: string, model: string): Promise<number> {
	const rows = await db
		.select({ n: count() })
		.from(configs)
		.innerJoin(prompts, eq(prompts.id, configs.promptId))
		.innerJoin(brands, eq(brands.id, prompts.brandId))
		.where(
			and(
				eq(configs.scope, "prompt"),
				eq(configs.model, model),
				eq(configs.key, "run.model_mode"),
				sql`${configs.value} <@ '["base","web"]'::jsonb`,
				eq(prompts.enabled, true),
				eq(brands.organizationId, organizationId),
			),
		);
	return Number(rows[0]?.n ?? 0);
}

function defaultCredentialsReady(providerId: string): boolean {
	try {
		return getProvider(providerId).isConfigured();
	} catch {
		return false;
	}
}

/**
 * A resolved brand: the effective target lists plus everything a prompt resolve
 * needs, so `resolvePromptTargets` composes on top without re-fetching the
 * catalog, entitlements, or the shared row prefix.
 */
export interface BrandResolution {
	organizationId: string;
	brandId: string;
	catalog: CatalogTarget[];
	entitlements: Entitlements;
	rows: ConfigRow[];
	credentialsReady: (providerId: string) => boolean;
	targets: EffectiveTarget[];
	excluded: ExcludedTarget[];
}

/**
 * Effective targets for a brand (the LLMs page / maintenance). `credentialsReady`
 * defaults to the live `getProvider(id).isConfigured()` probe (fail-closed).
 */
export async function resolveBrandTargets(
	brand: { id: string },
	organizationId: string,
	options: { credentialsReady?: (providerId: string) => boolean } = {},
): Promise<BrandResolution> {
	const credentialsReady = options.credentialsReady ?? defaultCredentialsReady;
	const [catalog, instanceRows, scopedRows, entitlements] = await Promise.all([
		getInstanceCatalog(),
		getInstanceRows(),
		fetchOrgAndBrandRows(organizationId, brand.id),
		getEntitlements(organizationId),
	]);
	const rows = [...instanceRows, ...scopedRows];
	const { targets, excluded } = resolveEffectiveTargets({
		catalog,
		entitlements,
		rows,
		level: "brand",
		credentialsReady,
	});
	return { organizationId, brandId: brand.id, catalog, entitlements, rows, credentialsReady, targets, excluded };
}

/**
 * Effective targets for a prompt: the brand resolution plus this prompt's
 * override rows and the live pool count. The worker calls
 * `resolveBrandTargets` once then this per prompt.
 */
export async function resolvePromptTargets(
	prompt: { id: string },
	brandResolution: BrandResolution,
	options: { assignablePoolUsage?: number } = {},
): Promise<EffectiveTargetsResult> {
	// The pool count is org-scoped and identical for every prompt in the org, so
	// a batch caller can compute it once and inject it here instead of per prompt.
	const [promptRows, assignablePoolUsage] = await Promise.all([
		fetchPromptRows(prompt.id),
		options.assignablePoolUsage ?? countAssignableModelUsage(brandResolution.organizationId, CLAUDE),
	]);
	return resolveEffectiveTargets({
		catalog: brandResolution.catalog,
		entitlements: brandResolution.entitlements,
		rows: [...brandResolution.rows, ...promptRows],
		level: "prompt",
		credentialsReady: brandResolution.credentialsReady,
		assignablePoolUsage,
	});
}
