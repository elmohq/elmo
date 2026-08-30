import { createFileRoute, notFound, useRouter } from "@tanstack/react-router";
import { Alert, AlertDescription } from "@workspace/ui/components/alert";
import { Badge } from "@workspace/ui/components/badge";
import { Button } from "@workspace/ui/components/button";
import { Input } from "@workspace/ui/components/input";
import { Label } from "@workspace/ui/components/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@workspace/ui/components/select";
import { useState } from "react";
import { useOrganization } from "@/hooks/use-organizations";
import { trackEvent } from "@/lib/posthog";
import { pageHead } from "@/lib/route-head";
import { useWriteErrorMessage } from "@/lib/write-errors";
import { cancelInvitationFn, inviteTeamMemberFn, listTeamFn, removeTeamMemberFn, type TeamData } from "@/server/team";

export const Route = createFileRoute("/_authed/app/org/$org/settings/members")({
	staticData: { crumb: "Team" },
	beforeLoad: ({ context }) => {
		if (context.clientConfig && !context.clientConfig.features.teamInvites) {
			throw notFound();
		}
	},
	loader: ({ context }): Promise<TeamData> => listTeamFn({ data: { organizationId: context.organization.id } }),
	head: pageHead({ description: "Invite teammates and manage team members." }),
	component: TeamSettingsPage,
});

function TeamSettingsPage() {
	const { id: organizationId } = useOrganization();
	const { members, invitations, currentUserId } = Route.useLoaderData();
	const writeError = useWriteErrorMessage();
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
			await inviteTeamMemberFn({ data: { organizationId, email: inviteEmail, role: inviteRole } });
			trackEvent("team_member_invited", { role: inviteRole });
			setInviteEmail("");
			setInviteRole("member");
			await router.invalidate();
		} catch (err) {
			setError(writeError(err, "Failed to send invitation"));
		} finally {
			setInviting(false);
		}
	}

	async function handleRemove(memberId: string) {
		setError(null);
		try {
			await removeTeamMemberFn({ data: { organizationId, memberId } });
			await router.invalidate();
		} catch (err) {
			setError(writeError(err, "Failed to remove member"));
		}
	}

	async function handleCancel(invitationId: string) {
		setError(null);
		try {
			await cancelInvitationFn({ data: { organizationId, invitationId } });
			await router.invalidate();
		} catch (err) {
			setError(writeError(err, "Failed to cancel invitation"));
		}
	}

	return (
		<div className="space-y-6">
			<h1 className="text-3xl font-bold">Team</h1>

			{error && (
				<Alert variant="destructive">
					<AlertDescription>{error}</AlertDescription>
				</Alert>
			)}

			<form onSubmit={handleInvite} className="flex flex-wrap items-end gap-3">
				<div className="flex flex-col gap-2">
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
				<div className="flex flex-col gap-2">
					<Label htmlFor="invite-role">Role</Label>
					<Select
						items={{ member: "Member", admin: "Admin" }}
						value={inviteRole}
						onValueChange={(value) => setInviteRole(value as "member" | "admin")}
					>
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
