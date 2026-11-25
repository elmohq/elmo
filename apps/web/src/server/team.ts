import { createServerFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";
import { getDeployment } from "@workspace/deployment";
import { db } from "@workspace/lib/db/db";
import { brands, invitation, member, memberBrandPin, organization, user } from "@workspace/lib/db/schema";
import { and, eq, ilike } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";
import { z } from "zod";
import { requireAuthSession, requireOrganization, requireOrganizationAdmin } from "@/lib/auth/helpers";
import { auth } from "@/lib/auth/server";

function requireTeamInvites(): void {
	if (!getDeployment().features.teamInvites) {
		throw new Error("Team invitations are not available in this deployment");
	}
}

export type TeamData = {
	members: {
		id: string;
		role: string;
		userId: string;
		name: string;
		email: string;
		pinnedBrandId: string | null;
		createdAt: Date;
	}[];
	brands: { id: string; name: string }[];
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

		const [members, invitations, brandRows] = await Promise.all([
			db
				.select({
					id: member.id,
					role: member.role,
					userId: member.userId,
					name: user.name,
					email: user.email,
					createdAt: member.createdAt,
					pinnedBrandId: memberBrandPin.brandId,
				})
				.from(member)
				.innerJoin(user, eq(member.userId, user.id))
				.leftJoin(memberBrandPin, eq(memberBrandPin.memberId, member.id))
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

			db
				.select({ id: brands.id, name: brands.name })
				.from(brands)
				.where(eq(brands.organizationId, org.id))
				.orderBy(brands.name, brands.id),
		]);

		return {
			members,
			invitations,
			brands: brandRows,
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
		const org = await requireOrganizationAdmin(session.user.id, data.organizationId);

		const email = data.email.trim().toLowerCase();

		const [existingUser] = await db.select({ id: user.id }).from(user).where(ilike(user.email, email)).limit(1);

		if (!existingUser) {
			const [pending] = await db
				.select({ id: invitation.id })
				.from(invitation)
				.where(and(eq(invitation.organizationId, org.id), ilike(invitation.email, email)))
				.limit(1);
			if (pending) {
				await db.delete(invitation).where(eq(invitation.id, pending.id));
			}

			const userId = uuidv4();
			const localPart = email.split("@")[0] ?? email;
			await db.transaction(async (tx) => {
				await tx.insert(user).values({ id: userId, name: localPart, email });
				await tx.insert(member).values({
					id: uuidv4(),
					organizationId: org.id,
					userId,
					role: data.role,
					createdAt: new Date(),
				});
			});

			await auth.api.requestPasswordReset({
				body: { email, redirectTo: "/auth/reset-password" },
				headers: getRequestHeaders(),
			});

			return { success: true, provisioned: true };
		}

		const [alreadyMember] = await db
			.select({ id: member.id })
			.from(member)
			.where(and(eq(member.organizationId, org.id), eq(member.userId, existingUser.id)))
			.limit(1);
		if (alreadyMember) throw new Error("This person is already a member of the organization");

		await auth.api.createInvitation({
			body: { email, role: data.role, organizationId: org.id },
			headers: getRequestHeaders(),
		});

		return { success: true };
	});

export const setMemberBrandPinFn = createServerFn({ method: "POST" })
	.validator(z.object({ organizationId: z.string(), memberId: z.string(), brandId: z.string().nullable() }))
	.handler(async ({ data }) => {
		requireTeamInvites();
		const session = await requireAuthSession();
		const org = await requireOrganizationAdmin(session.user.id, data.organizationId);

		const [row] = await db
			.select({ id: member.id, userId: member.userId })
			.from(member)
			.where(and(eq(member.id, data.memberId), eq(member.organizationId, org.id)))
			.limit(1);
		if (!row) throw new Error("Not found: no such member in this organization");
		if (row.userId === session.user.id) throw new Error("You cannot pin your own account to a brand");

		if (data.brandId) {
			const [brand] = await db
				.select({ id: brands.id })
				.from(brands)
				.where(and(eq(brands.id, data.brandId), eq(brands.organizationId, org.id)))
				.limit(1);
			if (!brand) throw new Error("Not found: no such brand in this organization");
			await db
				.insert(memberBrandPin)
				.values({ memberId: row.id, brandId: brand.id })
				.onConflictDoUpdate({ target: memberBrandPin.memberId, set: { brandId: brand.id } });
		} else {
			await db.delete(memberBrandPin).where(eq(memberBrandPin.memberId, row.id));
		}

		return { success: true };
	});

export const cancelInvitationFn = createServerFn({ method: "POST" })
	.validator(z.object({ organizationId: z.string(), invitationId: z.string() }))
	.handler(async ({ data }) => {
		requireTeamInvites();
		const session = await requireAuthSession();
		const org = await requireOrganizationAdmin(session.user.id, data.organizationId);

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
		const org = await requireOrganizationAdmin(session.user.id, data.organizationId);

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
