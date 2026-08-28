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
import { and, count, eq, or } from "drizzle-orm";
import { MAX_SLUG_LENGTH } from "../app-urls";
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
	await db.insert(organization).values({
		id: LOCAL_ORG.id,
		name: LOCAL_ORG.name,
		slug: LOCAL_ORG.slug,
		createdAt: new Date(),
	});

	await db.insert(member).values({
		id: crypto.randomUUID(),
		organizationId: LOCAL_ORG.id,
		userId: input.userId,
		role: "admin",
		createdAt: new Date(),
	});

	return { orgId: LOCAL_ORG.id };
}

/**
 * Slugify a brand or org name into the URL/id form used for brand ids and
 * org ids/slugs. Exported so the slug rules can be unit-tested directly
 * without a database.
 *
 * Note: leading/trailing hyphens are trimmed via index walks instead of an
 * `^-+|-+$` alternation regex — the alternation form trips ReDoS scanners
 * on inputs like `"---"` even though the JS engine handles it linearly.
 */
export function slugify(name: string): string {
	const cleaned = name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
	let start = 0;
	while (start < cleaned.length && cleaned[start] === "-") start++;
	let end = cleaned.length;
	while (end > start && cleaned[end - 1] === "-") end--;
	const slug = cleaned.slice(start, end);
	return slug || "brand";
}

/**
 * Appends -2, -3, … on collision. The slug namespace is checked alongside ids
 * because `/app/org/$org/brand/$brand` resolves a segment as either, so an id
 * equal to a sibling's slug would make one URL name two brands.
 */
export async function findUniqueBrandId(baseSlug: string): Promise<string> {
	let candidate = baseSlug;
	let suffix = 2;
	for (;;) {
		const [conflict] = await db
			.select({ id: brands.id })
			.from(brands)
			.where(or(eq(brands.id, candidate), eq(brands.slug, candidate)))
			.limit(1);
		if (!conflict) return candidate;
		candidate = `${baseSlug}-${suffix}`;
		suffix++;
	}
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
	options: { excludeOrgId?: string } = {},
	conn: DbConnection = db,
): Promise<boolean> {
	const [conflict] = await conn
		.select({ id: organization.id })
		.from(organization)
		.where(or(eq(organization.slug, slug), eq(organization.id, slug)))
		.limit(1);
	return !conflict || conflict.id === options.excludeOrgId;
}

/**
 * An org slug nothing else answers to, appending -2, -3, … on collision.
 */
async function findUniqueOrgSlug(baseSlug: string, conn: DbConnection = db): Promise<string> {
	let candidate = baseSlug;
	let suffix = 2;
	for (;;) {
		if (await isOrgSlugAvailable(candidate, {}, conn)) return candidate;
		candidate = `${baseSlug}-${suffix}`;
		suffix++;
	}
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
	options: { excludeBrandId?: string } = {},
	conn: DbConnection = db,
): Promise<boolean> {
	const [conflict] = await conn
		.select({ id: brands.id })
		.from(brands)
		.where(and(eq(brands.organizationId, organizationId), or(eq(brands.slug, slug), eq(brands.id, slug))))
		.limit(1);
	return !conflict || conflict.id === options.excludeBrandId;
}

/**
 * A brand slug free within the organization, appending -2, -3, … on collision. New
 * brands get one at creation, so a brand arrives with a readable URL instead of
 * waiting for someone to open settings and name one.
 */
export async function findUniqueBrandSlug(
	organizationId: string,
	baseSlug: string,
	conn: DbConnection = db,
): Promise<string> {
	let candidate = baseSlug;
	let suffix = 2;
	for (;;) {
		if (await isBrandSlugAvailable(organizationId, candidate, {}, conn)) return candidate;
		candidate = `${baseSlug}-${suffix}`;
		suffix++;
	}
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
	// rather than silently making one URL name two.
	if (!(await isOrgSlugAvailable(input.id, {}, conn))) {
		throw new Error(`Cannot create organization "${input.id}": another organization already answers to that name`);
	}

	const baseSlug = slugify(input.name);
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
	let orgSlug = "";

	await db.transaction(async (tx) => {
		// Resolve the slug inside the transaction so the uniqueness check and the
		// insert it guards see the same snapshot. Two same-named signups can still
		// collide on the slug unique index; that surfaces as a failed signup
		// rather than a duplicate org.
		const slug = await findUniqueOrgSlug(slugify(input.name), tx);
		orgSlug = slug;
		await tx.insert(organization).values({ id: orgId, name: input.name, slug, createdAt: new Date() });
		await tx.insert(member).values({
			id: crypto.randomUUID(),
			organizationId: orgId,
			userId: input.userId,
			role: "admin",
			createdAt: new Date(),
		});
	});

	return { orgId, slug: orgSlug };
}

// Re-exported so the server-side slug helpers above and their callers keep one
// import site; the rules themselves are pure and live with the URL shape.
export { isValidSlug, MAX_SLUG_LENGTH } from "../app-urls";
