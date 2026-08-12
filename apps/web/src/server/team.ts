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
import { requireAuthSession, requireOrganization } from "@/lib/auth/helpers";
import { auth } from "@/lib/auth/server";
import { getDeployment } from "@/lib/config/server";

function requireTeamInvites(): void {
	if (!getDeployment().features.teamInvites) {
		throw new Error("Team invitations are not available in this deployment");
	}
}

export type TeamData = {
	members: { id: string; role: string; userId: string; name: string; email: string; createdAt: Date }[];
	invitations: { id: string; email: string; role: string | null; expiresAt: Date }[];
	currentUserId: string;
	organization: { id: string; name: string };
};

export const listTeamFn = createServerFn({ method: "GET" })
	.validator(z.object({ org: z.string() }))
	// The explicit return type breaks the type-inference cycle between this
	// fn and route loaders that both consume it and redirect to typed routes
	// (same pattern as getBrandSwitcherData in routes/_authed/app/index.tsx).
	.handler(async ({ data }): Promise<TeamData> => {
		requireTeamInvites();
		const session = await requireAuthSession();
		const org = await requireOrganization(session.user.id, data.org);

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
			.where(eq(member.organizationId, org.id));

		const invitations = await db
			.select({
				id: invitation.id,
				email: invitation.email,
				role: invitation.role,
				expiresAt: invitation.expiresAt,
			})
			.from(invitation)
			.where(and(eq(invitation.organizationId, org.id), eq(invitation.status, "pending")));

		return {
			members,
			invitations,
			currentUserId: session.user.id,
			organization: { id: org.id, name: org.name },
		};
	});

export const inviteTeamMemberFn = createServerFn({ method: "POST" })
	.validator(
		z.object({
			org: z.string(),
			email: z.string().email(),
			role: z.enum(["member", "admin"]),
		}),
	)
	.handler(async ({ data }) => {
		requireTeamInvites();
		const session = await requireAuthSession();
		const org = await requireOrganization(session.user.id, data.org);

		await auth.api.createInvitation({
			body: { email: data.email, role: data.role, organizationId: org.id },
			headers: getRequestHeaders(),
		});

		return { success: true };
	});

export const cancelInvitationFn = createServerFn({ method: "POST" })
	.validator(z.object({ org: z.string(), invitationId: z.string() }))
	.handler(async ({ data }) => {
		requireTeamInvites();
		const session = await requireAuthSession();
		await requireOrganization(session.user.id, data.org);

		await auth.api.cancelInvitation({
			body: { invitationId: data.invitationId },
			headers: getRequestHeaders(),
		});

		return { success: true };
	});

export const removeTeamMemberFn = createServerFn({ method: "POST" })
	.validator(z.object({ org: z.string(), memberId: z.string() }))
	.handler(async ({ data }) => {
		requireTeamInvites();
		const session = await requireAuthSession();
		const org = await requireOrganization(session.user.id, data.org);

		const [row] = await db
			.select({ userId: member.userId })
			.from(member)
			.where(and(eq(member.id, data.memberId), eq(member.organizationId, org.id)))
			.limit(1);
		if (row?.userId === session.user.id) {
			throw new Error("You cannot remove yourself from the team");
		}

		await auth.api.removeMember({
			body: { memberIdOrEmail: data.memberId, organizationId: org.id },
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
