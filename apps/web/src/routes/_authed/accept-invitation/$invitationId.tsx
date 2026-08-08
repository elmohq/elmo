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
import { Button } from "@workspace/ui/components/button";
import { useState } from "react";
import FullPageCard from "@/components/full-page-card";
import { acceptInvitationFn, getInvitationFn } from "@/server/team";
import * as m from "@/paraglide/messages.js";

export const Route = createFileRoute("/_authed/accept-invitation/$invitationId")({
	loader: async ({ params }) => {
		try {
			const invitation = await getInvitationFn({ data: { invitationId: params.invitationId } });
			return { invitation, error: null };
		} catch (err) {
			return {
				invitation: null,
				error: err instanceof Error ? err.message : m.invitation_load_failed(),
			};
		}
	},
	component: AcceptInvitationPage,
});

function AcceptInvitationPage() {
	const { invitationId } = Route.useParams();
	const { invitation, error: loadError } = Route.useLoaderData();
	const navigate = useNavigate();
	const [accepting, setAccepting] = useState(false);
	const [acceptError, setAcceptError] = useState<string | null>(null);

	if (loadError || !invitation) {
		return (
			<FullPageCard title={m.invitation_unavailable()}>
				<div className="space-y-4 w-full">
					<Alert variant="destructive">
						<AlertDescription>{loadError ?? m.invitation_load_failed()}</AlertDescription>
					</Alert>
					<p className="text-sm text-muted-foreground text-center">
						{m.invitation_email_hint()}
					</p>
					<Button variant="outline" className="w-full" asChild>
						<Link to="/auth/logout">{m.invitation_switch_account()}</Link>
					</Button>
				</div>
			</FullPageCard>
		);
	}

	async function handleAccept() {
		setAcceptError(null);
		setAccepting(true);
		try {
			const { orgId } = await acceptInvitationFn({ data: { invitationId } });
			navigate({ to: "/app/$brand", params: { brand: orgId } });
		} catch (err) {
			setAcceptError(err instanceof Error ? err.message : m.invitation_accept_failed());
			setAccepting(false);
		}
	}

	return (
		<FullPageCard
			title={m.invitation_title({ organization: invitation.organizationName })}
			subtitle={m.invitation_by({ email: invitation.inviterEmail })}
		>
			<div className="space-y-4 w-full">
				{acceptError && (
					<Alert variant="destructive">
						<AlertDescription>{acceptError}</AlertDescription>
					</Alert>
				)}
				<Button className="w-full" onClick={handleAccept} disabled={accepting}>
					{accepting ? m.invitation_accepting() : m.invitation_accept()}
				</Button>
			</div>
		</FullPageCard>
	);
}
