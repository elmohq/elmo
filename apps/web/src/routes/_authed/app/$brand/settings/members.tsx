/**
 * /app/$brand/settings/members - Team settings page (cloud only)
 *
 * Invite teammates by email, list current members, and manage pending
 * invitations. The redirect in the loader is UX only — the security
 * boundary is the teamInvites guard inside every team server function.
 */
import { createFileRoute, redirect, useRouter } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { Alert, AlertDescription } from "@workspace/ui/components/alert";
import { Badge } from "@workspace/ui/components/badge";
import { Button } from "@workspace/ui/components/button";
import { Input } from "@workspace/ui/components/input";
import { Label } from "@workspace/ui/components/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@workspace/ui/components/select";
import { useState } from "react";
import { getDeployment } from "@/lib/config/server";
import { trackEvent } from "@/lib/posthog";
import { getAppName, getBrandName, buildTitle } from "@/lib/route-head";
import { cancelInvitationFn, inviteTeamMemberFn, listTeamFn, removeTeamMemberFn, type TeamData } from "@/server/team";
import { formatDate } from "@/i18n/formatting";
import * as m from "@/paraglide/messages.js";

const getTeamInvitesEnabled = createServerFn({ method: "GET" }).handler(async () => {
	return { teamInvites: getDeployment().features.teamInvites };
});

export const Route = createFileRoute("/_authed/app/$brand/settings/members")({
	loader: async ({ params }): Promise<TeamData> => {
		const { teamInvites } = await getTeamInvitesEnabled();
		if (!teamInvites) {
			throw redirect({ to: "/app/$brand", params: { brand: params.brand } });
		}
		return listTeamFn({ data: { brandId: params.brand } });
	},
	head: ({ matches, match }) => {
		const appName = getAppName(match);
		const brandName = getBrandName(matches);
		return {
			meta: [
				{ title: buildTitle(m.settings_team_title(), { appName, brandName }) },
				{ name: "description", content: m.settings_team_meta_description() },
			],
		};
	},
	component: TeamSettingsPage,
});

function TeamSettingsPage() {
	const { brand: brandId } = Route.useParams();
	const { members, invitations, currentUserId } = Route.useLoaderData();
	const router = useRouter();
	const [inviteEmail, setInviteEmail] = useState("");
	const [inviteRole, setInviteRole] = useState<"member" | "admin">("member");
	const [inviting, setInviting] = useState(false);
	const [error, setError] = useState<string | null>(null);

	async function handleInvite(e: React.FormEvent) {
		e.preventDefault();
		setError(null);
		setInviting(true);
		try {
			await inviteTeamMemberFn({ data: { brandId, email: inviteEmail, role: inviteRole } });
			trackEvent("team_member_invited", { role: inviteRole });
			setInviteEmail("");
			setInviteRole("member");
			await router.invalidate();
		} catch (err) {
			setError(err instanceof Error ? err.message : m.team_invite_failed());
		} finally {
			setInviting(false);
		}
	}

	async function handleRemove(memberId: string) {
		setError(null);
		try {
			await removeTeamMemberFn({ data: { brandId, memberId } });
			await router.invalidate();
		} catch (err) {
			setError(err instanceof Error ? err.message : m.team_remove_failed());
		}
	}

	async function handleCancel(invitationId: string) {
		setError(null);
		try {
			await cancelInvitationFn({ data: { brandId, invitationId } });
			await router.invalidate();
		} catch (err) {
			setError(err instanceof Error ? err.message : m.team_cancel_failed());
		}
	}

	return (
		<div className="space-y-6">
			<div>
				<h1 className="text-3xl font-bold">{m.settings_team_title()}</h1>
				<p className="text-muted-foreground">{m.settings_team_description()}</p>
			</div>

			{error && (
				<Alert variant="destructive">
					<AlertDescription>{error}</AlertDescription>
				</Alert>
			)}

			<form onSubmit={handleInvite} className="flex flex-wrap items-end gap-3">
				<div className="space-y-2">
					<Label htmlFor="invite-email">{m.team_email()}</Label>
					<Input
						id="invite-email"
						type="email"
						placeholder="teammate@example.com"
						value={inviteEmail}
						onChange={(e) => setInviteEmail(e.target.value)}
						required
						className="w-64"
					/>
				</div>
				<div className="space-y-2">
					<Label htmlFor="invite-role">{m.team_role()}</Label>
					<Select value={inviteRole} onValueChange={(value) => setInviteRole(value as "member" | "admin")}>
						<SelectTrigger id="invite-role" className="w-32">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="member">{m.team_member()}</SelectItem>
							<SelectItem value="admin">{m.team_admin()}</SelectItem>
						</SelectContent>
					</Select>
				</div>
				<Button type="submit" disabled={inviting}>
					{inviting ? m.team_inviting() : m.team_invite()}
				</Button>
			</form>

			<div className="space-y-3">
				<h2 className="text-lg font-semibold">{m.team_members()}</h2>
				<div className="divide-y rounded-md border">
					{members.map((member) => (
						<div key={member.id} className="flex items-center justify-between gap-3 p-3">
							<div className="min-w-0">
								<p className="truncate font-medium">{member.name}</p>
								<p className="truncate text-sm text-muted-foreground">{member.email}</p>
							</div>
							<div className="flex shrink-0 items-center gap-3">
								<Badge variant="secondary">{member.role}</Badge>
								{member.userId !== currentUserId && (
									<Button type="button" variant="outline" size="sm" onClick={() => handleRemove(member.id)}>
										{m.team_remove()}
									</Button>
								)}
							</div>
						</div>
					))}
				</div>
			</div>

			{invitations.length > 0 && (
				<div className="space-y-3">
					<h2 className="text-lg font-semibold">{m.team_pending()}</h2>
					<div className="divide-y rounded-md border">
						{invitations.map((inv) => (
							<div key={inv.id} className="flex items-center justify-between gap-3 p-3">
								<div className="min-w-0">
									<p className="truncate font-medium">{inv.email}</p>
									<p className="text-sm text-muted-foreground">
										{m.team_expires({ date: formatDate(inv.expiresAt) })}
									</p>
								</div>
								<div className="flex shrink-0 items-center gap-3">
									<Badge variant="secondary">{inv.role ?? "member"}</Badge>
									<Button type="button" variant="outline" size="sm" onClick={() => handleCancel(inv.id)}>
										{m.common_cancel()}
									</Button>
								</div>
							</div>
						))}
					</div>
				</div>
			)}
		</div>
	);
}
