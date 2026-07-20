/**
 * The one-shot env → DB config import (plan §10) plus the boot-time checks
 * that keep legacy env-configured deployments honest.
 *
 * The worker is the ONLY caller (amendment A1): web and worker envs are not
 * guaranteed identical and the worker owns spend, so a single deterministic
 * importer runs at worker boot. Web only reads — before the first worker boot
 * it renders a "no targets configured" state.
 */
import { getDeploymentModeFromEnv } from "@workspace/config/env";
import { type ModelConfig, parseScrapeTargets } from "@workspace/config/scrape-targets";
import { eq, isNull, sql } from "drizzle-orm";
import { db } from "../db/db";
import { configs, instanceMeta, modelTargets, type NewConfig, user } from "../db/schema";
import { REGISTRY } from "./registry";

/**
 * Advisory-lock key serializing concurrent first boots (two workers racing the
 * import). Two-int form of `pg_advisory_xact_lock`: classId 0x656c6d6f is
 * "elmo" in ASCII, objId 1 identifies the instance-config import. The lock is
 * transaction-scoped, so a racing boot blocks until the winner commits, then
 * sees the `instance_meta` row and short-circuits.
 */
export const INSTANCE_IMPORT_LOCK = { classId: 0x656c6d6f, objId: 1 } as const;

export interface EnsureInstanceConfigResult {
	imported: boolean;
	targetsImported: number;
	skippedEntries: string[];
	promotedUserId: string | null;
}

/** Identity tuple used both for import dedupe and the env↔catalog set-compare. */
function targetIdentityKey(target: {
	model: string;
	provider: string;
	version?: string | null;
	webSearch: boolean;
}): string {
	return JSON.stringify([target.model, target.provider, target.version ?? null, target.webSearch]);
}

/**
 * Parse SCRAPE_TARGETS entry-by-entry so one bad entry never aborts the import
 * (§10 amendment): each comma-separated piece goes through `parseScrapeTargets`
 * on its own. Valid entries are deduped on the identity tuple (the catalog's
 * unique constraint would reject exact duplicates); invalid ones land in
 * `skipped` verbatim.
 */
export function parseEnvScrapeTargets(raw: string | undefined): { targets: ModelConfig[]; skipped: string[] } {
	const targets = new Map<string, ModelConfig>();
	const skipped: string[] = [];
	if (!raw || !raw.trim()) return { targets: [], skipped };
	for (const piece of raw.split(",")) {
		const entry = piece.trim();
		try {
			const [parsed] = parseScrapeTargets(entry);
			const key = targetIdentityKey(parsed);
			if (!targets.has(key)) targets.set(key, parsed);
		} catch {
			skipped.push(entry);
		}
	}
	return { targets: [...targets.values()], skipped };
}

/**
 * Strict set equality of env entries vs instance catalog rows on the
 * model:provider:version:webSearch tuple — extra rows on either side count as
 * divergence (the deprecation warning fires for catalog edits too, since env
 * then no longer describes what actually runs).
 */
export function envMatchesCatalog(
	envTargets: ModelConfig[],
	catalog: { model: string; provider: string; version: string | null; webSearch: boolean }[],
): boolean {
	const envKeys = new Set(envTargets.map(targetIdentityKey));
	const catalogKeys = new Set(catalog.map(targetIdentityKey));
	if (envKeys.size !== catalogKeys.size) return false;
	for (const key of envKeys) {
		if (!catalogKeys.has(key)) return false;
	}
	return true;
}

/**
 * Local mode's instance-admin fix (plan finding #2): the sole install user is
 * promoted to `user.role = "admin"` so the instance-config surfaces are
 * reachable — nothing else ever grants that role in local mode. Strictly mode
 * "local": demo reuses a local-bootstrapped database read-only and must never
 * gain an admin; an unset or invalid DEPLOYMENT_MODE promotes nobody. Only
 * acts when exactly one user exists and no user holds the admin role, so any
 * multi-user database is left untouched.
 */
export async function ensureLocalInstanceAdmin(): Promise<string | null> {
	let mode: string;
	try {
		mode = getDeploymentModeFromEnv();
	} catch {
		return null;
	}
	if (mode !== "local") return null;

	const users = await db.select({ id: user.id, role: user.role }).from(user).limit(2);
	if (users.length !== 1) return null;
	const sole = users[0];
	if (sole.role === "admin") return null;

	await db.update(user).set({ role: "admin" }).where(eq(user.id, sole.id));
	return sole.id;
}

/**
 * Idempotent first-boot import, run by the worker at boot: seed `model_targets`
 * from SCRAPE_TARGETS, materialize DEFAULT_DELAY_HOURS / ONBOARDING_LLM_TARGET
 * as instance-scope config rows (only where they differ from registry
 * defaults), and stamp `instance_meta.envImportedAt`. Later boots short-circuit
 * on the `instance_meta` row but still run the env-divergence deprecation check
 * and the local instance-admin promotion.
 */
export async function ensureInstanceConfig(): Promise<EnsureInstanceConfigResult> {
	const rawScrapeTargets = process.env.SCRAPE_TARGETS;
	const env = parseEnvScrapeTargets(rawScrapeTargets);

	const outcome = await db.transaction(async (tx) => {
		// The existence check below is only race-free behind the lock.
		await tx.execute(sql`select pg_advisory_xact_lock(${INSTANCE_IMPORT_LOCK.classId}, ${INSTANCE_IMPORT_LOCK.objId})`);

		const existing = await tx.select({ id: instanceMeta.id }).from(instanceMeta).limit(1);
		if (existing.length > 0) return null;

		for (const entry of env.skipped) {
			console.warn(`[config-import] skipping invalid SCRAPE_TARGETS entry "${entry}" — not imported`);
		}
		if (env.targets.length > 0) {
			await tx.insert(modelTargets).values(
				env.targets.map((target) => ({
					organizationId: null,
					model: target.model,
					provider: target.provider,
					version: target.version ?? null,
					webSearch: target.webSearch,
					enabled: true,
				})),
			);
		}

		const instanceKeys: string[] = [];
		const configRows: NewConfig[] = [];

		// Only a value that actually changed behavior becomes a row: unset or
		// unparseable DEFAULT_DELAY_HOURS already fell back to the default at
		// runtime, and defaults are never written to the DB.
		const rawDelay = process.env.DEFAULT_DELAY_HOURS;
		if (rawDelay?.trim()) {
			const parsed = Number(rawDelay);
			if (Number.isFinite(parsed) && parsed > 0 && parsed !== REGISTRY["run.cadence_hours"].default) {
				configRows.push({ scope: "instance", key: "run.cadence_hours", value: parsed });
				instanceKeys.push("run.cadence_hours");
			}
		}

		const rawOnboardingTarget = process.env.ONBOARDING_LLM_TARGET?.trim();
		if (rawOnboardingTarget) {
			configRows.push({ scope: "instance", key: "onboarding.target", value: rawOnboardingTarget });
			instanceKeys.push("onboarding.target");
		}

		if (configRows.length > 0) await tx.insert(configs).values(configRows);

		await tx.insert(instanceMeta).values({ id: "instance", envImportedAt: new Date() });

		return { targetsImported: env.targets.length, instanceKeys };
	});

	if (outcome) {
		const keys = outcome.instanceKeys.length > 0 ? outcome.instanceKeys.join(", ") : "none";
		console.log(
			`[config-import] imported env config: ${outcome.targetsImported} model target(s), instance keys: ${keys}`,
		);
	}

	// Deprecation check, every boot: once the DB owns config, a still-set
	// SCRAPE_TARGETS that diverges from the catalog is a stale seed worth
	// exactly one warning. Right after a fresh import the sets match by
	// construction, so this stays silent.
	if (rawScrapeTargets?.trim()) {
		const catalog = await db
			.select({
				model: modelTargets.model,
				provider: modelTargets.provider,
				version: modelTargets.version,
				webSearch: modelTargets.webSearch,
			})
			.from(modelTargets)
			.where(isNull(modelTargets.organizationId));
		if (!envMatchesCatalog(env.targets, catalog)) {
			console.warn(
				"[config-import] SCRAPE_TARGETS no longer matches the model_targets catalog. " +
					"The database is authoritative; the env var was a one-time first-boot seed and is otherwise ignored. " +
					"Manage targets in the app settings and remove SCRAPE_TARGETS from the environment.",
			);
		}
	}

	const promotedUserId = await ensureLocalInstanceAdmin();

	return {
		imported: outcome !== null,
		targetsImported: outcome?.targetsImported ?? 0,
		skippedEntries: outcome ? env.skipped : [],
		promotedUserId,
	};
}
