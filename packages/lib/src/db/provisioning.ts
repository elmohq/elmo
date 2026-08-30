/**
 * User / org / membership provisioning, and the slug machinery the URL shape
 * needs.
 *
 * Demo deployments reuse a database populated by running the stack in local
 * mode first, so there is no separate demo provisioning path.
 *
 * The signup paths (`provisionLocalOrg`, `provisionUmbrellaOrg`) are one-shot:
 * the better-auth `user.create.before` hook rejects a signup when a user
 * already exists, so their plain INSERTs only ever run once against a given
 * database and a second call should fail at the database layer rather than
 * silently rewrite rows. `ensureOrganization` is the exception — it serves the
 * admin API, which can be called repeatedly for the same id.
 */
import { and, count, eq, inArray, ne, or } from "drizzle-orm";
import { MAX_SLUG_LENGTH, slugify } from "../app-urls";
import { db } from "./db";
import { brands, member, organization, user } from "./schema";

/**
 * The db handle or an open transaction — lets a provisioning step join a
 * caller's transaction so a later failure rolls its writes back too.
 */
export type DbConnection = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

/** For the local-mode signup guard: allow the first signup, reject the rest. */
export async function countUsers(): Promise<number> {
	const [row] = await db.select({ count: count() }).from(user);
	return row?.count ?? 0;
}

/**
 * Hardcoded: local mode has one org per install, the user never names it, and a
 * stable id makes `/app/org/default` predictable.
 */
const LOCAL_ORG = {
	id: "default",
	name: "Default",
	slug: "default",
} as const;

/** Called from the better-auth `user.create.after` hook. */
export async function provisionLocalOrg(input: { userId: string }): Promise<{ orgId: string }> {
	// One transaction: a failure between the two inserts would leave an
	// organization with no admin.
	await db.transaction(async (tx) => {
		await tx.insert(organization).values({
			id: LOCAL_ORG.id,
			name: LOCAL_ORG.name,
			slug: LOCAL_ORG.slug,
			createdAt: new Date(),
		});

		await tx.insert(member).values({
			id: crypto.randomUUID(),
			organizationId: LOCAL_ORG.id,
			userId: input.userId,
			role: "admin",
			createdAt: new Date(),
		});
	});

	return { orgId: LOCAL_ORG.id };
}

const SUFFIX_ATTEMPTS = 3;
const SUFFIX_DIGITS = 3;

const randomSuffix = () =>
	Math.floor(Math.random() * 10 ** SUFFIX_DIGITS)
		.toString()
		.padStart(SUFFIX_DIGITS, "0");

/**
 * The plain name, then a few `base-047` fallbacks, all offered at once so a
 * single query settles which of them is free.
 *
 * Random rather than counted, so two concurrent creates of the same name are
 * unlikely to pick the same fallback. The suffix is fitted inside
 * `MAX_SLUG_LENGTH` rather than appended past it: a slug the settings form
 * would refuse to save back is worse than a short one.
 */
export function nameCandidates(base: string): string[] {
	const stem = base.slice(0, MAX_SLUG_LENGTH - SUFFIX_DIGITS - 1).replace(/-+$/, "");
	return [base, ...Array.from({ length: SUFFIX_ATTEMPTS }, () => `${stem}-${randomSuffix()}`)];
}

/** Throws rather than widening the search: every candidate taken means something is wrong with the base. */
export function firstUnused(candidates: string[], taken: Set<string>): string {
	const unused = candidates.find((candidate) => !taken.has(candidate));
	if (!unused) throw new Error(`No unused name found for "${candidates[0]}"`);
	return unused;
}

/**
 * Which of `candidates` an organization already answers to.
 *
 * Slugs and ids are one namespace, because `/app/org/$org` resolves a segment as
 * either: a slug equal to another org's id would make one segment name two
 * organizations. Ids are not uniformly shaped — `default` in local, a uuid in
 * cloud signup, the brand's own id from the admin API — so no shape test could
 * stand in for the lookup.
 *
 * `excludeOrgId` is applied in the query rather than to the result, so a rename
 * can't mask another row that answers to the same name.
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

/**
 * Which of `candidates` a brand already answers to, in one organization or
 * across all of them. Same two namespaces as `takenOrgNames`, for the same
 * reason.
 */
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

/** Drizzle wraps driver errors, so the cause chain is searched too. */
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
export async function claimSlug<T>(write: () => Promise<T>, constraint: string, onTaken: () => never): Promise<T> {
	try {
		return await write();
	} catch (error) {
		if (isUniqueViolation(error, constraint)) onTaken();
		throw error;
	}
}

/** Global, unlike a brand's slug: a brand id has to clear every organization. */
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

async function findUnusedOrgSlug(baseSlug: string, conn: DbConnection = db): Promise<string> {
	const candidates = nameCandidates(baseSlug);
	return firstUnused(candidates, await takenOrgNames(candidates, conn));
}

/**
 * Scoped to the org rather than global: `/app/org/$org/brand/$brand` has
 * already picked the organization by the time the brand segment is read, so two
 * customers can each own a `nike`.
 */
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

/** Called at creation, so a brand arrives with a readable URL. */
export async function findUnusedBrandSlug(
	organizationId: string,
	baseSlug: string,
	conn: DbConnection = db,
): Promise<string> {
	const candidates = nameCandidates(baseSlug);
	return firstUnused(candidates, await takenBrandNames(candidates, conn, { organizationId }));
}

/**
 * An organization row for a brand created outside the signup and Auth0 flows —
 * the admin API (`POST /api/v1/brands`), which supplies the brand id itself.
 * Brands are hard-scoped to an org by a NOT NULL FK, so the org has to exist
 * first, and it takes the brand's id.
 *
 * A no-op when the org already exists, so an org synced from Auth0 or minted on
 * signup is never overwritten.
 */
export async function ensureOrganization(input: { id: string; name: string }, conn: DbConnection = db): Promise<void> {
	const [existing] = await conn
		.select({ id: organization.id })
		.from(organization)
		.where(eq(organization.id, input.id))
		.limit(1);
	if (existing) return;

	// The caller chose this id, so it has to clear the same namespace a slug
	// does — otherwise one segment would name two organizations.
	if (!(await isOrgSlugAvailable(input.id, { conn }))) {
		throw new Error(`Cannot create organization "${input.id}": another organization already answers to that name`);
	}

	const baseSlug = slugify(input.name, "organization");
	const slug = await findUnusedOrgSlug(baseSlug, conn);

	// Targeted at the id: the early return above already handles "org exists", so
	// this only absorbs a concurrent insert of the same id. Untargeted, it would
	// also swallow a slug collision and leave the brand's FK to fail instead.
	await claimSlug(
		() =>
			conn
				.insert(organization)
				.values({ id: input.id, name: input.name, slug, createdAt: new Date() })
				.onConflictDoNothing({ target: organization.id }),
		"organization_slug_unique",
		() => {
			throw new Error(`Cannot create organization "${input.id}": another organization already answers to that name`);
		},
	);
}

/**
 * The customer ("umbrella") org and admin membership for a new cloud user. Its
 * id is random rather than a brand's, so brands attach later with their own.
 */
export async function provisionUmbrellaOrg(input: {
	userId: string;
	name: string;
}): Promise<{ orgId: string; slug: string }> {
	const orgId = crypto.randomUUID();

	const slug = await db.transaction(async (tx) => {
		// Inside the transaction, so the check and the insert it guards run on one
		// connection. Two same-named signups still collide on the unique index,
		// which surfaces as a failed signup rather than a duplicate org.
		const resolved = await findUnusedOrgSlug(slugify(input.name, "organization"), tx);
		await tx.insert(organization).values({ id: orgId, name: input.name, slug: resolved, createdAt: new Date() });
		await tx.insert(member).values({
			id: crypto.randomUUID(),
			organizationId: orgId,
			userId: input.userId,
			role: "admin",
			createdAt: new Date(),
		});
		return resolved;
	});

	return { orgId, slug };
}
