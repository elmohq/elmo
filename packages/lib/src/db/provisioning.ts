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
import { and, count, eq, ne, or } from "drizzle-orm";
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

const SUFFIX_ATTEMPTS = 50;

/**
 * The first of `base`, `base-2`, `base-3`, … that nothing answers to.
 *
 * The suffix is fitted inside `MAX_SLUG_LENGTH` rather than appended past it: a
 * slug the settings form would then refuse to save is worse than a short one.
 */
export async function firstFreeName(base: string, isFree: (candidate: string) => Promise<boolean>): Promise<string> {
	if (await isFree(base)) return base;

	const withSuffix = async (suffix: string) => {
		const room = MAX_SLUG_LENGTH - suffix.length - 1;
		const candidate = `${base.slice(0, room).replace(/-+$/, "")}-${suffix}`;
		return (await isFree(candidate)) ? candidate : null;
	};

	// Counted suffixes cover every realistic collision. Past that something is
	// wrong with the base, and one request should not walk the namespace a row
	// at a time.
	for (let suffix = 2; suffix <= SUFFIX_ATTEMPTS; suffix++) {
		const candidate = await withSuffix(String(suffix));
		if (candidate) return candidate;
	}
	// A random suffix is near-certain to clear, so reaching here means the
	// availability check is persistently wrong. Bounded, so that fails loudly
	// instead of spinning while holding a transaction open.
	for (let attempt = 0; attempt < SUFFIX_ATTEMPTS; attempt++) {
		const candidate = await withSuffix(crypto.randomUUID().slice(0, 8));
		if (candidate) return candidate;
	}
	throw new Error(`No free name found for "${base}"`);
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

/** A brand id nothing answers to — see `isOrgSlugAvailable` for why slugs count. */
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
 * Slugs and ids are one namespace here, because `/app/org/$org` resolves a
 * segment as either: a slug equal to another org's id would make one segment
 * name two organizations. Ids are not uniformly shaped — `default` in local, a
 * uuid in cloud signup, the brand's own id from the admin API — so no shape
 * test could stand in for the lookup.
 */
export async function isOrgSlugAvailable(
	slug: string,
	options: { excludeOrgId?: string; conn?: DbConnection } = {},
): Promise<boolean> {
	// Excluded in the query, not after it: `limit(1)` could otherwise return the
	// renamed row while another one also answers to the name, and the check
	// would call it free.
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
 * Scoped to the org rather than global: `/app/org/$org/brand/$brand` has
 * already picked the organization by the time the brand segment is read, so two
 * customers can each own a `nike`.
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

/** Called at creation, so a brand arrives with a readable URL. */
export async function findUniqueBrandSlug(
	organizationId: string,
	baseSlug: string,
	conn: DbConnection = db,
): Promise<string> {
	return firstFreeName(baseSlug, (candidate) => isBrandSlugAvailable(organizationId, candidate, { conn }));
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
	const slug = await findUniqueOrgSlug(baseSlug, conn);

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
