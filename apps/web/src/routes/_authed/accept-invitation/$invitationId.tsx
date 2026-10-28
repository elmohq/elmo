/**
 * /accept-invitation/:invitationId - Accept a team invitation (cloud only)
 *
 * Sits under _authed so an invitee without a session is sent to login with
 * returnTo, and the login → register → verify chain lands them back here.
 * Better-auth requires the session email to match the invited email
 * (case-insensitively) and rejects expired or already-handled invitations.
 */
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Alert, AlertDescription } from "@workspace/ui/components/alert";
import { Button, buttonVariants } from "@workspace/ui/components/button";
import { useState } from "react";
import FullPageCard from "@/components/full-page-card";
import { useOrganizationsChanged } from "@/hooks/use-organizations";
import { buildTitle, getAppName } from "@/lib/route-head";
import { useWriteErrorMessage } from "@/lib/write-errors";
import { acceptInvitationFn, getInvitationFn } from "@/server/team";

export const Route = createFileRoute("/_authed/accept-invitation/$invitationId")({
	loader: async ({ params }) => {
		try {
			const invitation = await getInvitationFn({ data: { invitationId: params.invitationId } });
			return { invitation, error: null };
		} catch (err) {
			return {
				invitation: null,
				error: err instanceof Error ? err.message : "This invitation could not be loaded",
			};
		}
	},
	head: ({ match }) => {
		const appName = getAppName(match);
		return {
			meta: [
				{ title: buildTitle("Accept invitation", { appName }) },
				{ name: "description", content: "Join your team." },
			],
		};
	},
	component: AcceptInvitationPage,
});

function AcceptInvitationPage() {
	const { invitationId } = Route.useParams();
	const { invitation, error: loadError } = Route.useLoaderData();
	const organizationsChanged = useOrganizationsChanged();
	const navigate = useNavigate();
	const [accepting, setAccepting] = useState(false);
	const writeError = useWriteErrorMessage();
	const [acceptError, setAcceptError] = useState<string | null>(null);

	if (loadError || !invitation) {
		return (
			<FullPageCard title="Invitation unavailable">
				<div className="space-y-4 w-full">
					<Alert variant="destructive">
						<AlertDescription>{loadError ?? "This invitation could not be loaded"}</AlertDescription>
					</Alert>
					<p className="text-sm text-muted-foreground text-center">
						Make sure you're signed in with the email address that received this invitation.
					</p>
					<Link to="/auth/logout" className={buttonVariants({ variant: "outline", className: "w-full" })}>
						Switch account
					</Link>
				</div>
			</FullPageCard>
		);
	}

	async function handleAccept() {
		setAcceptError(null);
		setAccepting(true);
		try {
			const { orgSlug } = await acceptInvitationFn({ data: { invitationId } });
			await organizationsChanged(() => navigate({ to: "/app/org/$org", params: { org: orgSlug } }));
		} catch (err) {
			setAcceptError(writeError(err, "Failed to accept the invitation"));
			setAccepting(false);
		}
	}

	return (
		<FullPageCard
			title={`You've been invited to join ${invitation.organizationName}`}
			subtitle={`Invited by ${invitation.inviterEmail}`}
		>
			<div className="space-y-4 w-full">
				{acceptError && (
					<Alert variant="destructive">
						<AlertDescription>{acceptError}</AlertDescription>
					</Alert>
				)}
				<Button className="w-full" onClick={handleAccept} disabled={accepting}>
					{accepting ? "Accepting..." : "Accept invitation"}
				</Button>
			</div>
		</FullPageCard>
	);
}
