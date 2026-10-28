import { count, eq } from "drizzle-orm";
import { slugify } from "../app-urls";
import { db } from "./db";
import type { DbConnection } from "./db-connection";
import { member, organization, user } from "./schema";
import { claimOrgSlug, findUnusedOrgSlug, isOrgSlugAvailable } from "./unique-names";

export async function countUsers(): Promise<number> {
	const [row] = await db.select({ count: count() }).from(user);
	return row?.count ?? 0;
}

const LOCAL_ORG = {
	id: "default",
	name: "Default",
	slug: "default",
} as const;

export async function provisionLocalOrg(input: { userId: string }): Promise<{ orgId: string }> {
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

export async function ensureOrganization(input: { id: string; name: string }, conn: DbConnection = db): Promise<void> {
	const [existing] = await conn
		.select({ id: organization.id })
		.from(organization)
		.where(eq(organization.id, input.id))
		.limit(1);
	if (existing) return;

	if (!(await isOrgSlugAvailable(input.id, { conn }))) {
		throw new Error(`Cannot create organization "${input.id}": another organization already answers to that name`);
	}

	const baseSlug = slugify(input.name, "organization");
	const slug = await findUnusedOrgSlug(baseSlug, conn);

	// Targeted at the id: the early return above already handles "org exists", so
	// this only absorbs a concurrent insert of the same id. Untargeted, it would
	// also swallow a slug collision and leave the brand's FK to fail instead.
	await claimOrgSlug(
		() =>
			conn
				.insert(organization)
				.values({ id: input.id, name: input.name, slug, createdAt: new Date() })
				.onConflictDoNothing({ target: organization.id }),
		`Organization "${input.id}" lost a race for its URL slug — please retry`,
	);
}

export async function provisionUmbrellaOrg(input: {
	userId: string;
	name: string;
}): Promise<{ orgId: string; slug: string }> {
	const orgId = crypto.randomUUID();

	const slug = await db.transaction(async (tx) => {
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
