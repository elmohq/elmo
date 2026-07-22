/**
 * Server-only implementations behind `config-entries.ts`. They live apart from
 * the `createServerFn` surface because exporting them from that module would
 * keep it — and its transitive server-only imports — in the client bundle
 * (routes import the fns, so the module is in the client graph; only handler
 * bodies are compiled away). Unit tests exercise these impls directly.
 */
import { ASSIGNABLE_MODELS } from "@workspace/config/plans";
import { type Entitlements, getEntitlements } from "@workspace/lib/config/entitlements";
import {
	type ConfigRow,
	type Provenance,
	type ResolvedConfig,
	clearConfigCache,
	countAssignableModelUsage,
	fetchConfigRows,
	mergeConfigRows,
	resolveBrandTargets,
	resolveEffectiveTargets,
} from "@workspace/lib/config/resolve";
import type { ConfigScope } from "@workspace/lib/config/types";
import { db } from "@workspace/lib/db/db";
import { brands, configs, organization, prompts } from "@workspace/lib/db/schema";
import { and, eq, inArray, isNull, type SQL } from "drizzle-orm";
import { isAdmin, requireAuthSession, requireOrgAccess } from "@/lib/auth/helpers";
import { requireConfigWrite } from "@/lib/auth/config-gates";
import {
	type ConfigEntryInput,
	type ConfigWritePlan,
	type JsonValue,
	type ScopeIds,
	assertBrandModelPicks,
	assertClaudePoolHeadroom,
	planConfigWrite,
} from "@/server/config-enforcement";

const CLAUDE = ASSIGNABLE_MODELS[0];

interface ResolvedScopeRef {
	ids: ScopeIds;
	/** The org owning the scope (null only for instance scope). */
	organizationId: string | null;
	brand?: { id: string; organizationId: string };
	prompt?: { id: string; brandId: string; enabled: boolean };
}

/** Server-side scope resolution — the only place client ids are interpreted. */
async function resolveScopeRef(scope: ConfigScope, id: string | undefined): Promise<ResolvedScopeRef> {
	switch (scope) {
		case "instance":
			return {
				ids: { scope, organizationId: null, brandId: null, promptId: null },
				organizationId: null,
			};
		case "organization": {
			if (!id) throw new Error("organization id is required");
			const [org] = await db.select({ id: organization.id }).from(organization).where(eq(organization.id, id)).limit(1);
			if (!org) throw new Error("Organization not found");
			return {
				ids: { scope, organizationId: id, brandId: null, promptId: null },
				organizationId: id,
			};
		}
		case "brand": {
			if (!id) throw new Error("brand id is required");
			const [brand] = await db
				.select({ id: brands.id, organizationId: brands.organizationId })
				.from(brands)
				.where(eq(brands.id, id))
				.limit(1);
			if (!brand) throw new Error("Brand not found");
			return {
				ids: { scope, organizationId: null, brandId: id, promptId: null },
				organizationId: brand.organizationId,
				brand,
			};
		}
		case "prompt": {
			if (!id) throw new Error("prompt id is required");
			const [row] = await db
				.select({
					id: prompts.id,
					brandId: prompts.brandId,
					enabled: prompts.enabled,
					organizationId: brands.organizationId,
				})
				.from(prompts)
				.innerJoin(brands, eq(brands.id, prompts.brandId))
				.where(eq(prompts.id, id))
				.limit(1);
			if (!row) throw new Error("Prompt not found");
			return {
				ids: { scope, organizationId: null, brandId: null, promptId: id },
				organizationId: row.organizationId,
				brand: { id: row.brandId, organizationId: row.organizationId },
				prompt: { id: row.id, brandId: row.brandId, enabled: row.enabled },
			};
		}
	}
}

/** Reads: org members for their own org's scopes; instance scope is admin-only. */
async function requireScopeReadAccess(
	session: Awaited<ReturnType<typeof requireAuthSession>>,
	resolved: ResolvedScopeRef,
): Promise<void> {
	if (isAdmin(session)) return;
	if (resolved.organizationId === null) throw new Error("Unauthorized: Admin access required");
	await requireOrgAccess(session.user.id, resolved.organizationId);
}

/** The client-safe view of a row set at one scope (audit fields included). */
function toScopeRow(row: typeof configs.$inferSelect) {
	return {
		id: row.id,
		key: row.key,
		model: row.model,
		targetId: row.targetId,
		value: row.value as JsonValue,
		updatedAt: row.updatedAt,
	};
}

/** Resolved values with the jsonb `unknown` narrowed to a serializable type. */
function serializeValues(resolved: ResolvedConfig): Record<string, { value: JsonValue; provenance: Provenance }> {
	return Object.fromEntries(
		Object.entries(resolved).map(([property, entry]) => [
			property,
			{ value: entry.value as JsonValue, provenance: entry.provenance },
		]),
	);
}

export interface ScopeRefInput {
	scope: ConfigScope;
	id?: string;
}

/**
 * Effective config for a scope ref: per-key values with provenance, the rows
 * set at that scope, entitlements for the owning org, and — for brand/prompt —
 * the effective/excluded targets plus the org's assignable-pool usage.
 */
export async function getEffectiveConfigImpl(data: ScopeRefInput) {
	const session = await requireAuthSession();
	const resolved = await resolveScopeRef(data.scope, data.id);
	await requireScopeReadAccess(session, resolved);
	{
		const base = {
			scope: data.scope,
			organizationId: resolved.organizationId,
			brandId: resolved.brand?.id ?? null,
			promptId: resolved.prompt?.id ?? null,
		};

		switch (data.scope) {
			case "instance": {
				const rows = await db.select().from(configs).where(eq(configs.scope, "instance"));
				return {
					...base,
					values: serializeValues(mergeConfigRows(rows, {})),
					rows: rows.map(toScopeRow),
					entitlements: null as Entitlements | null,
					targets: null,
					excluded: null,
					assignablePoolUsage: null as number | null,
				};
			}
			case "organization": {
				const orgId = resolved.organizationId!;
				const [chainRows, entitlements] = await Promise.all([
					fetchConfigRows({ organizationId: orgId }),
					getEntitlements(orgId),
				]);
				const ownRows = await db
					.select()
					.from(configs)
					.where(and(eq(configs.scope, "organization"), eq(configs.organizationId, orgId)));
				return {
					...base,
					values: serializeValues(mergeConfigRows(chainRows, {})),
					rows: ownRows.map(toScopeRow),
					entitlements: entitlements as Entitlements | null,
					targets: null,
					excluded: null,
					assignablePoolUsage: null as number | null,
				};
			}
			case "brand": {
				const brand = resolved.brand!;
				const [resolution, poolUsage, ownRows] = await Promise.all([
					resolveBrandTargets(brand, brand.organizationId),
					countAssignableModelUsage(brand.organizationId, CLAUDE),
					db
						.select()
						.from(configs)
						.where(and(eq(configs.scope, "brand"), eq(configs.brandId, brand.id))),
				]);
				return {
					...base,
					values: serializeValues(mergeConfigRows(resolution.rows, {})),
					rows: ownRows.map(toScopeRow),
					entitlements: resolution.entitlements as Entitlements | null,
					targets: resolution.targets,
					excluded: resolution.excluded,
					assignablePoolUsage: poolUsage as number | null,
				};
			}
			case "prompt": {
				const brand = resolved.brand!;
				const prompt = resolved.prompt!;
				const [brandResolution, poolUsage, ownRows] = await Promise.all([
					resolveBrandTargets(brand, brand.organizationId),
					countAssignableModelUsage(brand.organizationId, CLAUDE),
					db
						.select()
						.from(configs)
						.where(and(eq(configs.scope, "prompt"), eq(configs.promptId, prompt.id))),
				]);
				const chainRows: ConfigRow[] = [...brandResolution.rows, ...ownRows];
				const result = resolveEffectiveTargets({
					catalog: brandResolution.catalog,
					entitlements: brandResolution.entitlements,
					rows: chainRows,
					level: "prompt",
					credentialsReady: brandResolution.credentialsReady,
					assignablePoolUsage: poolUsage,
				});
				return {
					...base,
					values: serializeValues(mergeConfigRows(chainRows, {})),
					rows: ownRows.map(toScopeRow),
					entitlements: brandResolution.entitlements as Entitlements | null,
					targets: result.targets,
					excluded: result.excluded,
					assignablePoolUsage: poolUsage as number | null,
				};
			}
		}
	}
}

/** The identity-tuple predicate for one planned row (NULLS NOT DISTINCT match). */
function tupleConditions(plan: ConfigWritePlan): SQL[] {
	return [
		eq(configs.scope, plan.scope),
		plan.organizationId === null ? isNull(configs.organizationId) : eq(configs.organizationId, plan.organizationId),
		plan.brandId === null ? isNull(configs.brandId) : eq(configs.brandId, plan.brandId),
		plan.promptId === null ? isNull(configs.promptId) : eq(configs.promptId, plan.promptId),
		plan.model === null ? isNull(configs.model) : eq(configs.model, plan.model),
		plan.targetId === null ? isNull(configs.targetId) : eq(configs.targetId, plan.targetId),
		eq(configs.key, plan.key),
	];
}

/**
 * Write-time entitlement clamps (§7/A4/A5). UX guards, not the spend authority
 * (the worker re-clamps at schedule time); all inert outside cloud.
 */
async function applyWriteClamps(
	plans: ConfigWritePlan[],
	resolved: ResolvedScopeRef,
	entitlements: Entitlements,
): Promise<void> {
	for (const plan of plans) {
		if (plan.action !== "upsert") continue;

		// Brand model picks: ⊆ plan menu, count ≤ picks (A4).
		if (plan.key === "run.enabled_models" && plan.scope === "brand") {
			assertBrandModelPicks(entitlements, plan.value as string[]);
		}

		// Assignable-model (Claude) prompt assignment: a NEW assignment on an
		// ENABLED prompt needs pool headroom (A5 — disabled prompts don't consume
		// the pool; the enable transition re-checks them).
		const isAssignable = plan.model !== null && (ASSIGNABLE_MODELS as readonly string[]).includes(plan.model);
		const createsAssignment =
			plan.scope === "prompt" &&
			isAssignable &&
			(plan.key === "run.model_mode" || (plan.key === "run.model_enabled" && plan.value === true));
		if (!createsAssignment || !resolved.prompt?.enabled) continue;

		const existing = await db
			.select({ key: configs.key, value: configs.value })
			.from(configs)
			.where(
				and(
					eq(configs.scope, "prompt"),
					eq(configs.promptId, plan.promptId!),
					eq(configs.model, plan.model!),
					inArray(configs.key, ["run.model_mode", "run.model_enabled"]),
				),
			);
		const alreadyAssigned = existing.some(
			(row) => row.key === "run.model_mode" || (row.key === "run.model_enabled" && row.value === true),
		);
		if (alreadyAssigned) continue;

		const usage = await countAssignableModelUsage(resolved.organizationId!, plan.model!);
		assertClaudePoolHeadroom(entitlements, usage + 1);
	}
}

export interface SetConfigValuesInput extends ScopeRefInput {
	entries: ConfigEntryInput[];
}

/**
 * Write config entries for one scope ref. Per entry: registry validation
 * (schema, allowed scope/selector) → per-key policy gate → entitlement clamps;
 * then ALL rows in one transaction (settings forms save atomically). `value`
 * null/undefined deletes the row (revert to inherit).
 */
export async function setConfigValuesImpl(data: SetConfigValuesInput): Promise<{ written: number; deleted: number }> {
	const session = await requireAuthSession();
	const resolved = await resolveScopeRef(data.scope, data.id);

	const plans = data.entries.map((entry) => planConfigWrite(resolved.ids, entry));

	for (const entry of data.entries) {
		await requireConfigWrite({ key: entry.key, scope: data.scope, orgId: resolved.organizationId });
	}

	if (resolved.organizationId !== null) {
		const entitlements = await getEntitlements(resolved.organizationId);
		await applyWriteClamps(plans, resolved, entitlements);
	}

	let written = 0;
	let deleted = 0;
	await db.transaction(async (tx) => {
		for (const plan of plans) {
			if (plan.action === "delete") {
				await tx.delete(configs).where(and(...tupleConditions(plan)));
				deleted += 1;
			} else {
				await tx
					.insert(configs)
					.values({
						scope: plan.scope,
						organizationId: plan.organizationId,
						brandId: plan.brandId,
						promptId: plan.promptId,
						model: plan.model,
						targetId: plan.targetId,
						key: plan.key,
						value: plan.value,
						updatedBy: session.user.id,
					})
					.onConflictDoUpdate({
						target: [
							configs.scope,
							configs.organizationId,
							configs.brandId,
							configs.promptId,
							configs.model,
							configs.targetId,
							configs.key,
						],
						set: { value: plan.value, updatedBy: session.user.id, updatedAt: new Date() },
					});
				written += 1;
			}
		}
	});
	clearConfigCache();

	return { written, deleted };
}
