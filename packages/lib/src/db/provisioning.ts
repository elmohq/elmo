/**
 * User / org / membership provisioning.
 *
 * Single place where "create a new user with an org and admin membership"
 * happens for local mode. Demo deployments reuse a database populated by
 * running the stack in local mode first, so there is no separate demo
 * provisioning path — the public demo box is just a read-only view over
 * that already-bootstrapped data.
 *
 * Everything here is one-shot: the better-auth `user.create.before` hook
 * rejects any signup when a user already exists, so these inserts only
 * ever run once against a given database. The SQL is plain INSERTs (no
 * upsert, no existence checks) to make that intent obvious — a second
 * call is a bug and should fail at the database layer rather than
 * silently rewriting rows.
 */
import { and, count, eq, ne, or } from "drizzle-orm";
import { MAX_SLUG_LENGTH, slugify } from "../app-urls";
import { db } from "./db";
import { brands, member, organization, user } from "./schema";

/**
 * The db handle or an open transaction — lets a provisioning step join a
 * caller's transaction so a later failure rolls its writes back too.
 */
export type DbConnection = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Number of users in the database.
 *
 * Used by the local-mode signup guard — "allow the first signup, reject
 * every subsequent one". Kept as its own small function so the hook
 * doesn't import drizzle directly.
 */
export async function countUsers(): Promise<number> {
	const [row] = await db.select({ count: count() }).from(user);
	return row?.count ?? 0;
}

/**
 * The single organization created in local mode.
 *
 * Hardcoded because local mode has exactly one org per install, the user
 * never sees or interacts with this identity (they pick a brand in the
 * onboarding wizard, which is what the UI actually surfaces), and a
 * stable id makes URLs like `/app/org/default` predictable.
 */
const LOCAL_ORG = {
	id: "default",
	name: "Default",
	slug: "default",
} as const;

/**
 * Create the organization + admin membership for a freshly-created
 * local-mode user. Called from the better-auth `user.create.after`
 * database hook so the user always lands in exactly one org with admin
 * rights.
 */
export async function provisionLocalOrg(input: { userId: string }): Promise<{ orgId: string }> {
	// One transaction, like provisionUmbrellaOrg below: a failure between the
	// two inserts would otherwise leave an organization with no admin.
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

const SUFFIX_ATTEMPTS = 50;

/**
 * The first name in `base`, `base-2`, `base-3`, … that nothing answers to.
 *
 * The suffix is fitted inside `MAX_SLUG_LENGTH` rather than appended past it,
 * so a long name that collides still produces a segment `isValidSlug` accepts
 * — a slug the settings form would then refuse to save is worse than a
 * slightly shorter one.
 */
export async function firstFreeName(base: string, isFree: (candidate: string) => Promise<boolean>): Promise<string> {
	if (await isFree(base)) return base;

	const withSuffix = async (suffix: string) => {
		const room = MAX_SLUG_LENGTH - suffix.length - 1;
		const candidate = `${base.slice(0, room).replace(/-+$/, "")}-${suffix}`;
		return (await isFree(candidate)) ? candidate : null;
	};

	// Counted suffixes read well and cover every realistic collision. Past that
	// something is wrong with the base, and a random suffix ends the loop rather
	// than letting one request walk the namespace a row at a time.
	for (let suffix = 2; suffix <= SUFFIX_ATTEMPTS; suffix++) {
		const candidate = await withSuffix(String(suffix));
		if (candidate) return candidate;
	}
	// Random suffixes are near-certain to clear, so this only runs when the
	// availability check is persistently wrong — bounded so that failure is
	// loud instead of a request spinning while holding a transaction open.
	for (let attempt = 0; attempt < SUFFIX_ATTEMPTS; attempt++) {
		const candidate = await withSuffix(crypto.randomUUID().slice(0, 8));
		if (candidate) return candidate;
	}
	throw new Error(`No free name found for "${base}"`);
}

/**
 * Whether an error is a Postgres unique-violation, optionally on a named
 * constraint. Availability checks and their writes can race under READ
 * COMMITTED, so the unique index is the real guarantee — callers catch its
 * violation here and translate it into the friendly error the check was
 * supposed to produce. Drizzle wraps driver errors, so the cause chain is
 * searched too.
 */
export function isUniqueViolation(error: unknown, constraint?: string): boolean {
	let cause: unknown = error;
	while (cause instanceof Error || (cause && typeof cause === "object")) {
		const err = cause as { code?: string; constraint?: string; cause?: unknown };
		if (err.code === "23505" && (!constraint || err.constraint === constraint)) return true;
		cause = err.cause;
	}
	return false;
}

/**
 * A brand id nothing answers to. The slug namespace is checked alongside ids
 * because `/app/org/$org/brand/$brand` resolves a segment as either, so an id
 * equal to another brand's slug would make one URL name two brands.
 */
export async function findUniqueBrandId(baseSlug: string, conn: DbConnection = db): Promise<string> {
	return firstFreeName(baseSlug, async (candidate) => {
		const [conflict] = await conn
			.select({ id: brands.id })
			.from(brands)
			.where(or(eq(brands.id, candidate), eq(brands.slug, candidate)))
			.limit(1);
		return !conflict;
	});
}

/**
 * Whether an org slug is free.
 *
 * Both namespaces are checked, because `/app/org/$org` resolves a segment as a
 * slug *or* an id: a slug equal to another org's id would make that segment
 * name two organizations. Ids here are not uniformly shaped — local mode uses
 * `default`, cloud signup a uuid, the admin API the brand's own id — so no
 * shape test could stand in for the lookup.
 */
export async function isOrgSlugAvailable(
	slug: string,
	options: { excludeOrgId?: string; conn?: DbConnection } = {},
): Promise<boolean> {
	// The organization being renamed is excluded in the query rather than after
	// it: `limit(1)` could otherwise return that row while another one also
	// answers to the name, and the check would call it free.
	const [conflict] = await (options.conn ?? db)
		.select({ id: organization.id })
		.from(organization)
		.where(
			and(
				or(eq(organization.slug, slug), eq(organization.id, slug)),
				options.excludeOrgId ? ne(organization.id, options.excludeOrgId) : undefined,
			),
		)
		.limit(1);
	return !conflict;
}

async function findUniqueOrgSlug(baseSlug: string, conn: DbConnection = db): Promise<string> {
	return firstFreeName(baseSlug, (candidate) => isOrgSlugAvailable(candidate, { conn }));
}

/**
 * Whether a brand slug is free within its organization.
 *
 * Scoped to the org rather than global — `/app/org/$org/brand/$brand` has
 * already picked the organization by the time the brand segment is read, so two
 * customers can each own a `nike`. Ids are checked alongside slugs for the same
 * reason they are for orgs: the segment resolves as either.
 */
export async function isBrandSlugAvailable(
	organizationId: string,
	slug: string,
	options: { excludeBrandId?: string; conn?: DbConnection } = {},
): Promise<boolean> {
	// Excluded in the query, not after it — see `isOrgSlugAvailable`.
	const [conflict] = await (options.conn ?? db)
		.select({ id: brands.id })
		.from(brands)
		.where(
			and(
				eq(brands.organizationId, organizationId),
				or(eq(brands.slug, slug), eq(brands.id, slug)),
				options.excludeBrandId ? ne(brands.id, options.excludeBrandId) : undefined,
			),
		)
		.limit(1);
	return !conflict;
}

/**
 * A brand slug free within the organization. New brands get one at creation, so
 * a brand arrives with a readable URL instead of waiting for someone to open
 * settings and name one.
 */
export async function findUniqueBrandSlug(
	organizationId: string,
	baseSlug: string,
	conn: DbConnection = db,
): Promise<string> {
	return firstFreeName(baseSlug, (candidate) => isBrandSlugAvailable(organizationId, candidate, { conn }));
}

/**
 * Ensure an organization row exists for a brand created outside the normal
 * signup / Auth0 flows — specifically the admin API (`POST /api/v1/brands`),
 * which accepts a caller-supplied brand id and no longer has a session/org to
 * lean on. Brands are hard-scoped to an org via a NOT NULL FK, so the org must
 * exist before the brand is inserted.
 *
 * No-op when the org already exists: we never overwrite an org that was synced
 * from Auth0 (whitelabel) or created on signup. The brand id is reused as the
 * org id (the long-standing convention), with a collision-free slug.
 */
export async function ensureOrganization(input: { id: string; name: string }, conn: DbConnection = db): Promise<void> {
	const [existing] = await conn
		.select({ id: organization.id })
		.from(organization)
		.where(eq(organization.id, input.id))
		.limit(1);
	if (existing) return;

	// The caller supplies this id, and `/app/org/$org` resolves a segment as a
	// slug or an id — so an id another organization answers to is refused here
	// rather than silently making one URL name two. The check can still race a
	// concurrent insert; the slug unique index is the backstop, mapped to the
	// same error.
	try {
		if (!(await isOrgSlugAvailable(input.id, { conn }))) {
			throw new Error(`Cannot create organization "${input.id}": another organization already answers to that name`);
		}

		const baseSlug = slugify(input.name, "organization");
		const slug = await findUniqueOrgSlug(baseSlug, conn);

		// Target the id explicitly: the early-return above already handles "org
		// exists", so this only guards a concurrent insert of the same id (no-op).
		// An untargeted onConflictDoNothing would also swallow a slug-unique
		// collision, silently skip the insert, and leave the caller's brand FK to
		// fail with a confusing error instead.
		await conn
			.insert(organization)
			.values({ id: input.id, name: input.name, slug, createdAt: new Date() })
			.onConflictDoNothing({ target: organization.id });
	} catch (error) {
		if (isUniqueViolation(error, "organization_slug_unique")) {
			throw new Error(`Cannot create organization "${input.id}": another organization already answers to that name`);
		}
		throw error;
	}
}

/**
 * Create the single customer ("umbrella") org + admin membership for a new
 * user. The org id is decoupled from any brand (a random id), so brands can be
 * attached later with their own ids. Used by the cloud user.create.after hook.
 */
export async function provisionUmbrellaOrg(input: {
	userId: string;
	name: string;
}): Promise<{ orgId: string; slug: string }> {
	const orgId = crypto.randomUUID();

	const slug = await db.transaction(async (tx) => {
		// Resolve the slug inside the transaction so the uniqueness check and the
		// insert it guards run on one connection. Two same-named signups can still
		// collide on the slug unique index (the real guarantee); that surfaces as a
		// failed signup rather than a duplicate org.
		const resolved = await findUniqueOrgSlug(slugify(input.name, "organization"), tx);
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
