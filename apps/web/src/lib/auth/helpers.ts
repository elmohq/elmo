/**
 * Server-side auth helpers backed by better-auth.
 */
import { getRequestHeaders } from "@tanstack/react-start/server";
import { db } from "@workspace/lib/db/db";
import { brands, member, organization } from "@workspace/lib/db/schema";
import { and, eq, or } from "drizzle-orm";
import { getDeployment } from "@/lib/config/server";
import { auth } from "./server";

type SessionLike = { user: { id: string; [key: string]: unknown }; session?: unknown };

export async function getAuthSession() {
	const headers = getRequestHeaders();
	return auth.api.getSession({ headers });
}

export async function requireAuthSession() {
	const session = await getAuthSession();
	if (!session) throw new Error("Unauthorized: Authentication required");
	return session;
}

export function isAdmin(session: SessionLike): boolean {
	return session.user.role === "admin";
}

export function hasReportAccess(session: SessionLike): boolean {
	// Report generation is disabled entirely in deployments that don't support
	// it (cloud), so the per-user flag is ignored there.
	if (!getDeployment().features.reportGeneration) return false;
	return session.user.hasReportGeneratorAccess === true;
}

export function canEditPlatformPicks(): boolean {
	return getDeployment().features.platformPicksEditable;
}

export function requirePlatformPicksEditable(): void {
	if (!canEditPlatformPicks()) {
		throw new Error("Platform picks are set by whoever runs this deployment.");
	}
}

export async function checkOrgAccess(userId: string, orgId: string): Promise<boolean> {
	const [row] = await db
		.select({ id: member.id })
		.from(member)
		.where(and(eq(member.userId, userId), eq(member.organizationId, orgId)))
		.limit(1);
	return !!row;
}

export async function requireOrgAccess(userId: string, orgId: string): Promise<void> {
	if (!(await checkOrgAccess(userId, orgId))) {
		throw new Error("Forbidden: No access to this organization");
	}
}

/**
 * Whether the user may access a brand, resolved through the brand's owning org
 * (`brands.organizationId`) — the umbrella-org access rule. A single joined
 * query: brand → its org → a membership row for this user.
 */
async function checkBrandAccess(userId: string, brandId: string): Promise<boolean> {
	const [row] = await db
		.select({ id: member.id })
		.from(brands)
		.innerJoin(member, and(eq(member.organizationId, brands.organizationId), eq(member.userId, userId)))
		.where(eq(brands.id, brandId))
		.limit(1);
	return !!row;
}

export async function requireBrandAccess(userId: string, brandId: string): Promise<void> {
	if (!(await checkBrandAccess(userId, brandId))) {
		throw new Error("Forbidden: No access to this brand");
	}
}

/**
 * The brand's owning org plus the caller's membership in it — for callers that
 * need the org itself, not just an access verdict. Resolves both in the one
 * query that `requireBrandAccess` would have spent on the check alone.
 *
 * A missing brand and a brand in someone else's org are deliberately the same
 * error: the caller has no business distinguishing them.
 */
export async function requireBrandOrganization(userId: string, brandId: string): Promise<UserOrganization> {
	const [row] = await db
		.select({ id: organization.id, slug: organization.slug, name: organization.name, role: member.role })
		.from(brands)
		.innerJoin(member, and(eq(member.organizationId, brands.organizationId), eq(member.userId, userId)))
		.innerJoin(organization, eq(organization.id, brands.organizationId))
		.where(eq(brands.id, brandId))
		.limit(1);
	if (!row) throw new Error("Forbidden: No access to this brand");
	return row;
}

export interface UserOrganization {
	id: string;
	slug: string;
	name: string;
	role: string;
}

/**
 * Oldest membership first, so a user's own workspace precedes any they were
 * invited into. `organization.id` breaks ties, which a batch Auth0 sync
 * produces by stamping every membership it creates with the same timestamp.
 */
export async function listUserOrganizations(userId: string): Promise<UserOrganization[]> {
	return db
		.select({ id: organization.id, slug: organization.slug, name: organization.name, role: member.role })
		.from(member)
		.innerJoin(organization, eq(member.organizationId, organization.id))
		.where(eq(member.userId, userId))
		.orderBy(member.createdAt, organization.id);
}

/**
 * The organization behind an `/app/org/$org` segment, or null when the user has no
 * such workspace. Accepts the slug (what the URL carries) or the id, so links
 * minted before an org was renamed — and anything built from an
 * `organizationId` in hand — still resolve.
 */
export async function resolveOrganization(userId: string, slugOrId: string): Promise<UserOrganization | null> {
	const [row] = await db
		.select({ id: organization.id, slug: organization.slug, name: organization.name, role: member.role })
		.from(organization)
		.innerJoin(member, and(eq(member.organizationId, organization.id), eq(member.userId, userId)))
		.where(or(eq(organization.slug, slugOrId), eq(organization.id, slugOrId)))
		.limit(1);
	return row ?? null;
}

export async function requireOrganization(userId: string, slugOrId: string): Promise<UserOrganization> {
	const org = await resolveOrganization(userId, slugOrId);
	if (!org) throw new Error("Forbidden: No access to this workspace");
	return org;
}
