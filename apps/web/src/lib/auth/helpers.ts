/**
 * Server-side auth helpers backed by better-auth.
 */
import { getRequestHeaders } from "@tanstack/react-start/server";
import { db } from "@workspace/lib/db/db";
import { brands, member, organization } from "@workspace/lib/db/schema";
import { eq, and } from "drizzle-orm";
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

export async function getBrandOrganizationId(brandId: string): Promise<string | undefined> {
	const [brand] = await db
		.select({ organizationId: brands.organizationId })
		.from(brands)
		.where(eq(brands.id, brandId))
		.limit(1);
	return brand?.organizationId;
}

export async function checkBrandAccess(userId: string, brandId: string): Promise<boolean> {
	const organizationId = await getBrandOrganizationId(brandId);
	return organizationId ? checkOrgAccess(userId, organizationId) : false;
}

export async function requireBrandAccess(userId: string, brandId: string): Promise<void> {
	if (!(await checkBrandAccess(userId, brandId))) {
		throw new Error("Forbidden: No access to this brand");
	}
}

export async function getOrgMemberRole(userId: string, orgId: string): Promise<string | undefined> {
	const [row] = await db
		.select({ role: member.role })
		.from(member)
		.where(and(eq(member.userId, userId), eq(member.organizationId, orgId)))
		.limit(1);
	return row?.role;
}

export async function requireOrgAdminAccess(userId: string, orgId: string): Promise<void> {
	const role = await getOrgMemberRole(userId, orgId);
	if (role !== "admin" && role !== "owner") {
		throw new Error("Forbidden: Organization administrator access required");
	}
}

export async function listUserOrganizations(userId: string): Promise<{ id: string; name: string }[]> {
	return db
		.select({ id: organization.id, name: organization.name })
		.from(member)
		.innerJoin(organization, eq(member.organizationId, organization.id))
		.where(eq(member.userId, userId));
}
