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
import {
	cancelInvitationFn,
	inviteTeamMemberFn,
	listTeamFn,
	removeTeamMemberFn,
	updateOrganizationFn,
	type TeamData,
} from "@/server/team";

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
				{ title: buildTitle("Team", { appName, brandName }) },
				{ name: "description", content: "Invite teammates and manage team members." },
			],
		};
	},
	component: TeamSettingsPage,
});

function TeamSettingsPage() {
	const { brand: brandId } = Route.useParams();
	const { members, invitations, currentUserId, organization } = Route.useLoaderData();
	const router = useRouter();
	const [inviteEmail, setInviteEmail] = useState("");
	const [inviteRole, setInviteRole] = useState<"member" | "admin">("member");
	const [inviting, setInviting] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [workspaceName, setWorkspaceName] = useState(organization.name);
	const [savingWorkspace, setSavingWorkspace] = useState(false);

	async function handleSaveWorkspace(e: React.FormEvent) {
		e.preventDefault();
		setError(null);
		setSavingWorkspace(true);
		try {
			await updateOrganizationFn({ data: { brandId, name: workspaceName } });
			await router.invalidate();
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to update workspace name");
		} finally {
			setSavingWorkspace(false);
		}
	}

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
			setError(err instanceof Error ? err.message : "Failed to send invitation");
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
			setError(err instanceof Error ? err.message : "Failed to remove member");
		}
	}

	async function handleCancel(invitationId: string) {
		setError(null);
		try {
			await cancelInvitationFn({ data: { brandId, invitationId } });
			await router.invalidate();
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to cancel invitation");
		}
	}

	return (
		<div className="space-y-6">
			<div>
				<h1 className="text-3xl font-bold">Team</h1>
				<p className="text-muted-foreground">Invite teammates and manage who has access to your workspace.</p>
			</div>

			{error && (
				<Alert variant="destructive">
					<AlertDescription>{error}</AlertDescription>
				</Alert>
			)}

			<div className="space-y-3">
				<h2 className="text-lg font-semibold">Workspace</h2>
				<form onSubmit={handleSaveWorkspace} className="flex flex-wrap items-end gap-3">
					<div className="space-y-2">
						<Label htmlFor="workspace-name">Name</Label>
						<Input
							id="workspace-name"
							value={workspaceName}
							onChange={(e) => setWorkspaceName(e.target.value)}
							required
							className="w-64"
						/>
					</div>
					<Button type="submit" disabled={savingWorkspace}>
						{savingWorkspace ? "Saving..." : "Save"}
					</Button>
				</form>
			</div>

			<form onSubmit={handleInvite} className="flex flex-wrap items-end gap-3">
				<div className="space-y-2">
					<Label htmlFor="invite-email">Email</Label>
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
					<Label htmlFor="invite-role">Role</Label>
					<Select value={inviteRole} onValueChange={(value) => setInviteRole(value as "member" | "admin")}>
						<SelectTrigger id="invite-role" className="w-32">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="member">Member</SelectItem>
							<SelectItem value="admin">Admin</SelectItem>
						</SelectContent>
					</Select>
				</div>
				<Button type="submit" disabled={inviting}>
					{inviting ? "Inviting..." : "Invite"}
				</Button>
			</form>

			<div className="space-y-3">
				<h2 className="text-lg font-semibold">Members</h2>
				<div className="divide-y rounded-md border">
					{members.map((m) => (
						<div key={m.id} className="flex items-center justify-between gap-3 p-3">
							<div className="min-w-0">
								<p className="truncate font-medium">{m.name}</p>
								<p className="truncate text-sm text-muted-foreground">{m.email}</p>
							</div>
							<div className="flex shrink-0 items-center gap-3">
								<Badge variant="secondary">{m.role}</Badge>
								{m.userId !== currentUserId && (
									<Button type="button" variant="outline" size="sm" onClick={() => handleRemove(m.id)}>
										Remove
									</Button>
								)}
							</div>
						</div>
					))}
				</div>
			</div>

			{invitations.length > 0 && (
				<div className="space-y-3">
					<h2 className="text-lg font-semibold">Pending invitations</h2>
					<div className="divide-y rounded-md border">
						{invitations.map((inv) => (
							<div key={inv.id} className="flex items-center justify-between gap-3 p-3">
								<div className="min-w-0">
									<p className="truncate font-medium">{inv.email}</p>
									<p className="text-sm text-muted-foreground">
										Expires {new Date(inv.expiresAt).toLocaleDateString()}
									</p>
								</div>
								<div className="flex shrink-0 items-center gap-3">
									<Badge variant="secondary">{inv.role ?? "member"}</Badge>
									<Button type="button" variant="outline" size="sm" onClick={() => handleCancel(inv.id)}>
										Cancel
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
