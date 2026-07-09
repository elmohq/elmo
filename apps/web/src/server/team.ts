/**
 * Server functions for team membership and invitations (cloud only).
 *
 * Mutations go through better-auth's org plugin API in-process
 * (auth.api.*), which enforces the caller's member role and triggers
 * sendInvitationEmail — the org plugin's HTTP endpoints stay blocked
 * for every mode (see lib/auth/policies.ts).
 */
import { createServerFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";
import { db } from "@workspace/lib/db/db";
import { invitation, member, user } from "@workspace/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { requireAuthSession, requireOrgAccess } from "@/lib/auth/helpers";
import { auth } from "@/lib/auth/server";
import { getDeployment } from "@/lib/config/server";

function requireTeamInvites(): void {
	if (!getDeployment().features.teamInvites) {
		throw new Error("Team invitations are not available in this deployment");
	}
}

export const listTeamFn = createServerFn({ method: "GET" })
	.validator(z.object({ brandId: z.string() }))
	.handler(async ({ data }) => {
		requireTeamInvites();
		const session = await requireAuthSession();
		await requireOrgAccess(session.user.id, data.brandId);

		const members = await db
			.select({
				id: member.id,
				role: member.role,
				userId: member.userId,
				name: user.name,
				email: user.email,
				createdAt: member.createdAt,
			})
			.from(member)
			.innerJoin(user, eq(member.userId, user.id))
			.where(eq(member.organizationId, data.brandId));

		const invitations = await db
			.select({
				id: invitation.id,
				email: invitation.email,
				role: invitation.role,
				expiresAt: invitation.expiresAt,
			})
			.from(invitation)
			.where(and(eq(invitation.organizationId, data.brandId), eq(invitation.status, "pending")));

		return { members, invitations, currentUserId: session.user.id };
	});

export const inviteTeamMemberFn = createServerFn({ method: "POST" })
	.validator(
		z.object({
			brandId: z.string(),
			email: z.string().email(),
			role: z.enum(["member", "admin"]),
		}),
	)
	.handler(async ({ data }) => {
		requireTeamInvites();
		const session = await requireAuthSession();
		await requireOrgAccess(session.user.id, data.brandId);

		await auth.api.createInvitation({
			body: { email: data.email, role: data.role, organizationId: data.brandId },
			headers: getRequestHeaders(),
		});

		return { success: true };
	});

export const cancelInvitationFn = createServerFn({ method: "POST" })
	.validator(z.object({ brandId: z.string(), invitationId: z.string() }))
	.handler(async ({ data }) => {
		requireTeamInvites();
		const session = await requireAuthSession();
		await requireOrgAccess(session.user.id, data.brandId);

		await auth.api.cancelInvitation({
			body: { invitationId: data.invitationId },
			headers: getRequestHeaders(),
		});

		return { success: true };
	});

export const removeTeamMemberFn = createServerFn({ method: "POST" })
	.validator(z.object({ brandId: z.string(), memberId: z.string() }))
	.handler(async ({ data }) => {
		requireTeamInvites();
		const session = await requireAuthSession();
		await requireOrgAccess(session.user.id, data.brandId);

		const [row] = await db
			.select({ userId: member.userId })
			.from(member)
			.where(and(eq(member.id, data.memberId), eq(member.organizationId, data.brandId)))
			.limit(1);
		if (row?.userId === session.user.id) {
			throw new Error("You cannot remove yourself from the team");
		}

		await auth.api.removeMember({
			body: { memberIdOrEmail: data.memberId, organizationId: data.brandId },
			headers: getRequestHeaders(),
		});

		return { success: true };
	});

export const getInvitationFn = createServerFn({ method: "GET" })
	.validator(z.object({ invitationId: z.string() }))
	.handler(async ({ data }) => {
		requireTeamInvites();
		await requireAuthSession();

		return auth.api.getInvitation({
			query: { id: data.invitationId },
			headers: getRequestHeaders(),
		});
	});

export const acceptInvitationFn = createServerFn({ method: "POST" })
	.validator(z.object({ invitationId: z.string() }))
	.handler(async ({ data }) => {
		requireTeamInvites();
		await requireAuthSession();

		const result = await auth.api.acceptInvitation({
			body: { invitationId: data.invitationId },
			headers: getRequestHeaders(),
		});

		return { orgId: result.invitation.organizationId };
	});
