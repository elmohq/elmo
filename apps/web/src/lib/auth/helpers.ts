/**
 * Server-side auth helpers backed by better-auth.
 */
import { getRequestHeaders } from "@tanstack/react-start/server";
import { db } from "@workspace/lib/db/db";
import { member, organization, brands } from "@workspace/lib/db/schema";
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

/**
 * Whether the user may access a brand, resolved through the brand's owning org
 * (`brands.organizationId`) — the umbrella-org access rule. A single joined
 * query: brand → its org → a membership row for this user.
 */
export async function checkBrandAccess(userId: string, brandId: string): Promise<boolean> {
	const [row] = await db
		.select({ id: member.id })
		.from(brands)
		.innerJoin(
			member,
			and(eq(member.organizationId, brands.organizationId), eq(member.userId, userId)),
		)
		.where(eq(brands.id, brandId))
		.limit(1);
	return !!row;
}

export async function requireBrandAccess(userId: string, brandId: string): Promise<void> {
	if (!(await checkBrandAccess(userId, brandId))) {
		throw new Error("Forbidden: No access to this brand");
	}
}

export async function listUserOrganizations(userId: string): Promise<{ id: string; name: string }[]> {
	return db
		.select({ id: organization.id, name: organization.name })
		.from(member)
		.innerJoin(organization, eq(member.organizationId, organization.id))
		.where(eq(member.userId, userId));
}
