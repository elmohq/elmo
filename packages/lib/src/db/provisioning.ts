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
import { count, eq } from "drizzle-orm";
import { db } from "./db";
import { brands, member, organization, user } from "./schema";

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
 * stable id makes URLs like `/app/default` predictable.
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
 * Slugs that would collide with sibling routes under `/app/$brand`. A
 * user-named brand that slugifies to one of these gets a numeric suffix
 * instead so the URL stays unambiguous.
 */
const RESERVED_ORG_SLUGS = new Set(["new"]);

/**
 * Find a brand id that doesn't collide with an existing brand row or a
 * reserved route slug, appending -2, -3, … on collision. Brand ids are
 * globally unique — they appear directly in `/app/$brand` URLs — and, unlike
 * the legacy org-per-brand convention, are independent of any organization id.
 */
export async function findUniqueBrandId(baseSlug: string): Promise<string> {
	let candidate = baseSlug;
	let suffix = 2;
	for (;;) {
		const isReserved = RESERVED_ORG_SLUGS.has(candidate);
		const conflict = isReserved
			? [{ id: candidate }]
			: await db.select({ id: brands.id }).from(brands).where(eq(brands.id, candidate)).limit(1);
		if (conflict.length === 0) return candidate;
		candidate = `${baseSlug}-${suffix}`;
		suffix++;
	}
}

/**
 * Find an organization slug that doesn't collide with an existing org,
 * appending -2, -3, … on collision. Used by `provisionUmbrellaOrg`, where the
 * org id itself is a random uuid (decoupled from any brand) but the slug
 * still needs to be unique and human-readable.
 */
async function findUniqueOrgSlug(baseSlug: string): Promise<string> {
	let candidate = baseSlug;
	let suffix = 2;
	for (;;) {
		const [conflict] = await db
			.select({ id: organization.id })
			.from(organization)
			.where(eq(organization.slug, candidate))
			.limit(1);
		if (!conflict) return candidate;
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
export async function ensureOrganization(input: { id: string; name: string }): Promise<void> {
	const [existing] = await db
		.select({ id: organization.id })
		.from(organization)
		.where(eq(organization.id, input.id))
		.limit(1);
	if (existing) return;

	const baseSlug = slugify(input.name);
	let slug = baseSlug;
	for (let suffix = 2; ; suffix++) {
		const [conflict] = await db
			.select({ id: organization.id })
			.from(organization)
			.where(eq(organization.slug, slug))
			.limit(1);
		if (!conflict) break;
		slug = `${baseSlug}-${suffix}`;
	}

	// Target the id explicitly: the early-return above already handles "org
	// exists", so this only guards a concurrent insert of the same id (no-op).
	// An untargeted onConflictDoNothing would also swallow a slug-unique
	// collision, silently skip the insert, and leave the caller's brand FK to
	// fail with a confusing error instead.
	await db
		.insert(organization)
		.values({ id: input.id, name: input.name, slug, createdAt: new Date() })
		.onConflictDoNothing({ target: organization.id });
}

/**
 * Create the single customer ("umbrella") org + admin membership for a new
 * user. The org id is decoupled from any brand (a random id), so brands can be
 * attached later with their own ids. Used by the cloud user.create.after hook.
 */
export async function provisionUmbrellaOrg(input: { userId: string; name: string }): Promise<{ orgId: string }> {
	const orgId = crypto.randomUUID();
	const baseSlug = slugify(input.name);
	const slug = await findUniqueOrgSlug(baseSlug);

	await db.transaction(async (tx) => {
		await tx.insert(organization).values({ id: orgId, name: input.name, slug, createdAt: new Date() });
		await tx.insert(member).values({
			id: crypto.randomUUID(),
			organizationId: orgId,
			userId: input.userId,
			role: "admin",
			createdAt: new Date(),
		});
	});

	return { orgId };
}
