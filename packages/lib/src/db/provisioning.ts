/**
 * User / org / membership provisioning.
 *
 * Single place where signup-created organizations and memberships are
 * provisioned. Local is intentionally one-shot; cloud provisioning is
 * idempotent because Better Auth's post-create hook can leave a committed user
 * behind if a later database or network operation fails.
 */
import { and, count, eq } from "drizzle-orm";
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
const RESERVED_BRAND_IDS = new Set(["new", "workspaces"]);

export function isReservedBrandId(value: string): boolean {
	return RESERVED_BRAND_IDS.has(value);
}

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
		const isReserved = isReservedBrandId(candidate);
		const conflict = isReserved
			? [{ id: candidate }]
			: await db.select({ id: brands.id }).from(brands).where(eq(brands.id, candidate)).limit(1);
		if (conflict.length === 0) return candidate;
		candidate = `${baseSlug}-${suffix}`;
		suffix++;
	}
}

function encodeIdentifier(value: string): string {
	return Array.from(new TextEncoder().encode(value), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** Stable identity used to make cloud signup provisioning safely retryable. */
export function getCloudWorkspaceIdentity(input: { userId: string; name: string }): {
	organizationId: string;
	membershipId: string;
	slug: string;
} {
	const encodedUserId = encodeIdentifier(input.userId);
	return {
		organizationId: `workspace_${encodedUserId}`,
		membershipId: `workspace_owner_${encodedUserId}`,
		slug: `${slugify(input.name)}-${encodedUserId}`,
	};
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
 * user. The org id is decoupled from every brand and derived from the immutable
 * user id so a failed post-signup hook can be retried safely.
 */
export async function provisionUmbrellaOrg(input: { userId: string; name: string }): Promise<{ orgId: string }> {
	const identity = getCloudWorkspaceIdentity(input);

	await db.transaction(async (tx) => {
		await tx
			.insert(organization)
			.values({ id: identity.organizationId, name: input.name, slug: identity.slug, createdAt: new Date() })
			.onConflictDoNothing({ target: organization.id });

		const [existingMembership] = await tx
			.select({ id: member.id })
			.from(member)
			.where(and(eq(member.organizationId, identity.organizationId), eq(member.userId, input.userId)))
			.limit(1);
		if (!existingMembership) {
			await tx
				.insert(member)
				.values({
					id: identity.membershipId,
					organizationId: identity.organizationId,
					userId: input.userId,
					role: "admin",
					createdAt: new Date(),
				})
				.onConflictDoNothing({ target: member.id });
		}
	});

	return { orgId: identity.organizationId };
}
