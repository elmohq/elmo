import { createServerFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";
import { db } from "@workspace/lib/db/db";
import { invitation, member, organization, user } from "@workspace/lib/db/schema";
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
	.validator(z.object({ organizationId: z.string() }))
	.handler(async ({ data }): Promise<TeamData> => {
		requireTeamInvites();
		const session = await requireAuthSession();
		const org = await requireOrganization(session.user.id, data.organizationId);

		const [members, invitations] = await Promise.all([
			db
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
				.where(eq(member.organizationId, org.id)),

			db
				.select({
					id: invitation.id,
					email: invitation.email,
					role: invitation.role,
					expiresAt: invitation.expiresAt,
				})
				.from(invitation)
				.where(and(eq(invitation.organizationId, org.id), eq(invitation.status, "pending"))),
		]);

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
			organizationId: z.string(),
			email: z.string().email(),
			role: z.enum(["member", "admin"]),
		}),
	)
	.handler(async ({ data }) => {
		requireTeamInvites();
		const session = await requireAuthSession();
		const org = await requireOrganization(session.user.id, data.organizationId);

		await auth.api.createInvitation({
			body: { email: data.email, role: data.role, organizationId: org.id },
			headers: getRequestHeaders(),
		});

		return { success: true };
	});

export const cancelInvitationFn = createServerFn({ method: "POST" })
	.validator(z.object({ organizationId: z.string(), invitationId: z.string() }))
	.handler(async ({ data }) => {
		requireTeamInvites();
		const session = await requireAuthSession();
		const org = await requireOrganization(session.user.id, data.organizationId);

		const [row] = await db
			.select({ id: invitation.id })
			.from(invitation)
			.where(and(eq(invitation.id, data.invitationId), eq(invitation.organizationId, org.id)))
			.limit(1);
		if (!row) throw new Error("Not found: no such invitation in this organization");

		await auth.api.cancelInvitation({
			body: { invitationId: data.invitationId },
			headers: getRequestHeaders(),
		});

		return { success: true };
	});

export const removeTeamMemberFn = createServerFn({ method: "POST" })
	.validator(z.object({ organizationId: z.string(), memberId: z.string() }))
	.handler(async ({ data }) => {
		requireTeamInvites();
		const session = await requireAuthSession();
		const org = await requireOrganization(session.user.id, data.organizationId);

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
	.handler(async ({ data }): Promise<{ orgSlug: string }> => {
		requireTeamInvites();
		await requireAuthSession();

		const result = await auth.api.acceptInvitation({
			body: { invitationId: data.invitationId },
			headers: getRequestHeaders(),
		});

		const [org] = await db
			.select({ slug: organization.slug })
			.from(organization)
			.where(eq(organization.id, result.invitation.organizationId))
			.limit(1);
		if (!org) throw new Error("The organization for this invitation no longer exists");
		return { orgSlug: org.slug };
	});
