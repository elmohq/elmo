import { getRequestHeaders } from "@tanstack/react-start/server";
import { getDeployment } from "@workspace/deployment";
import { db } from "@workspace/lib/db/db";
import { brands, member, organization } from "@workspace/lib/db/schema";
import { and, eq } from "drizzle-orm";
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

async function checkOrgAccess(userId: string, orgId: string): Promise<boolean> {
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

/** Access to a brand is membership of the organization that owns it. */
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

export async function requireBrandSession(brandId: string) {
	const session = await requireAuthSession();
	await requireBrandAccess(session.user.id, brandId);
	return session;
}

/** A missing brand and one in someone else's org are deliberately the same error. */
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

export async function listUserOrganizations(userId: string): Promise<UserOrganization[]> {
	return db
		.select({ id: organization.id, slug: organization.slug, name: organization.name, role: member.role })
		.from(member)
		.innerJoin(organization, eq(member.organizationId, organization.id))
		.where(eq(member.userId, userId))
		.orderBy(member.createdAt, organization.id);
}

/**
 * By id, not by URL segment: resolving a segment is the layout's job, and doing
 * it here too would put the slug-or-id precedence rule in a second place.
 */
export async function requireOrganization(userId: string, organizationId: string): Promise<UserOrganization> {
	const [row] = await db
		.select({ id: organization.id, slug: organization.slug, name: organization.name, role: member.role })
		.from(organization)
		.innerJoin(member, and(eq(member.organizationId, organization.id), eq(member.userId, userId)))
		.where(eq(organization.id, organizationId))
		.limit(1);
	if (!row) throw new Error("Forbidden: No access to this organization");
	return row;
}
