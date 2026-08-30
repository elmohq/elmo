/**
 * Picking a URL-safe name nothing else answers to, and surviving the race
 * between checking that and writing it.
 */
import { and, eq, inArray, ne, or } from "drizzle-orm";
import { MAX_SLUG_LENGTH } from "../app-urls";
import { db } from "./db";
import type { DbConnection } from "./db-connection";
import { brands, organization } from "./schema";

const SUFFIX_ATTEMPTS = 3;
const SUFFIX_DIGITS = 3;

const randomSuffix = () =>
	Math.floor(Math.random() * 10 ** SUFFIX_DIGITS)
		.toString()
		.padStart(SUFFIX_DIGITS, "0");

/**
 * Random rather than counted, so two concurrent creates of the same name are
 * unlikely to pick the same fallback. The suffix is fitted inside
 * `MAX_SLUG_LENGTH` rather than appended past it: a slug the settings form
 * would refuse to save back is worse than a short one.
 */
export function nameCandidates(base: string): string[] {
	const stem = base.slice(0, MAX_SLUG_LENGTH - SUFFIX_DIGITS - 1).replace(/-+$/, "");
	return [base, ...Array.from({ length: SUFFIX_ATTEMPTS }, () => `${stem}-${randomSuffix()}`)];
}

export function firstUnused(candidates: string[], taken: Set<string>): string {
	const unused = candidates.find((candidate) => !taken.has(candidate));
	if (!unused) throw new Error(`No unused name found for "${candidates[0]}"`);
	return unused;
}

/**
 * Slugs and ids are one namespace, because `/app/org/$org` resolves a segment as
 * either: a slug equal to another org's id would make one segment name two
 * organizations. Ids are not uniformly shaped, so no shape test stands in for
 * the lookup.
 *
 * `excludeOrgId` is applied in the query, not to the result, so a rename can't
 * mask another row that answers to the same name.
 */
async function takenOrgNames(candidates: string[], conn: DbConnection, excludeOrgId?: string): Promise<Set<string>> {
	const rows = await conn
		.select({ id: organization.id, slug: organization.slug })
		.from(organization)
		.where(
			and(
				or(inArray(organization.slug, candidates), inArray(organization.id, candidates)),
				excludeOrgId ? ne(organization.id, excludeOrgId) : undefined,
			),
		);
	return new Set(rows.flatMap((row) => [row.id, row.slug]));
}

async function takenBrandNames(
	candidates: string[],
	conn: DbConnection,
	scope: { organizationId?: string; excludeBrandId?: string } = {},
): Promise<Set<string>> {
	const rows = await conn
		.select({ id: brands.id, slug: brands.slug })
		.from(brands)
		.where(
			and(
				or(inArray(brands.slug, candidates), inArray(brands.id, candidates)),
				scope.organizationId ? eq(brands.organizationId, scope.organizationId) : undefined,
				scope.excludeBrandId ? ne(brands.id, scope.excludeBrandId) : undefined,
			),
		);
	return new Set(rows.flatMap((row) => (row.slug === null ? [row.id] : [row.id, row.slug])));
}

export function isUniqueViolation(error: unknown, constraint?: string): boolean {
	let cause: unknown = error;
	for (let depth = 0; depth < 10 && (cause instanceof Error || (cause && typeof cause === "object")); depth++) {
		const err = cause as { code?: string; constraint?: string; cause?: unknown };
		if (err.code === "23505" && (!constraint || err.constraint === constraint)) return true;
		cause = err.cause;
	}
	return false;
}

/**
 * An availability check and the write it guards can race under READ COMMITTED,
 * so the unique index is the real guarantee: the check gives the friendly path,
 * and this maps the loser's violation to the error that check would have
 * produced. Every slug write goes through here rather than repeating the pair.
 */
async function claimSlug<T>(write: () => Promise<T>, constraint: string, takenMessage: string): Promise<T> {
	try {
		return await write();
	} catch (error) {
		if (isUniqueViolation(error, constraint)) throw new Error(takenMessage);
		throw error;
	}
}

// Bound here rather than at each write: a constraint name that doesn't match the
// index is a mapping that silently never fires.
export const claimOrgSlug = <T>(write: () => Promise<T>, takenMessage: string): Promise<T> =>
	claimSlug(write, "organization_slug_unique", takenMessage);

export const claimBrandSlug = <T>(write: () => Promise<T>, takenMessage: string): Promise<T> =>
	claimSlug(write, "brands_organization_id_slug_idx", takenMessage);

/** The three brand-create paths refuse a lost race the same way. */
export const claimNewBrandSlug = <T>(write: () => Promise<T>): Promise<T> =>
	claimBrandSlug(write, "Brand creation failed due to a concurrent create — please retry");

export async function findUnusedBrandId(baseSlug: string, conn: DbConnection = db): Promise<string> {
	const candidates = nameCandidates(baseSlug);
	return firstUnused(candidates, await takenBrandNames(candidates, conn));
}

export async function isOrgSlugAvailable(
	slug: string,
	options: { excludeOrgId?: string; conn?: DbConnection } = {},
): Promise<boolean> {
	return !(await takenOrgNames([slug], options.conn ?? db, options.excludeOrgId)).has(slug);
}

export async function findUnusedOrgSlug(baseSlug: string, conn: DbConnection = db): Promise<string> {
	const candidates = nameCandidates(baseSlug);
	return firstUnused(candidates, await takenOrgNames(candidates, conn));
}

export async function isBrandSlugAvailable(
	organizationId: string,
	slug: string,
	options: { excludeBrandId?: string; conn?: DbConnection } = {},
): Promise<boolean> {
	const taken = await takenBrandNames([slug], options.conn ?? db, {
		organizationId,
		excludeBrandId: options.excludeBrandId,
	});
	return !taken.has(slug);
}

export async function findUnusedBrandSlug(
	organizationId: string,
	baseSlug: string,
	conn: DbConnection = db,
): Promise<string> {
	const candidates = nameCandidates(baseSlug);
	return firstUnused(candidates, await takenBrandNames(candidates, conn, { organizationId }));
}
