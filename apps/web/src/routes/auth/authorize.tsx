/**
 * /auth/authorize — where the MCP OAuth flow asks a person to say yes.
 *
 * The better-auth `mcp` plugin sends a signed-in browser here with the
 * authorization request in the query, signed. The only thing that turns that
 * into a code the client can spend is `POST /api/auth/oauth2/consent` — which
 * happens on a click and nowhere else.
 *
 * Nothing about the request is interpreted here beyond naming the client. Every
 * other parameter is carried and handed back unread — validating them is the
 * plugin's job, and doing any of it twice is how the two get to disagree.
 *
 * An attacker who gets a signed-in browser to load this URL therefore reaches
 * the consent screen — which is where the person says no.
 */
import { createFileRoute } from "@tanstack/react-router";
import { authClient } from "@workspace/lib/auth/client";
import { Alert, AlertDescription } from "@workspace/ui/components/alert";
import { Button } from "@workspace/ui/components/button";
import { useState } from "react";
import FullPageCard from "@/components/full-page-card";
import { buildTitle, getAppName } from "@/lib/route-head";
import { getMcpClientFn } from "@/server/mcp-clients";
import { getViewerFn } from "@/server/viewer";

/**
 * The plugin signs the whole authorization query, and the consent endpoint
 * re-derives that signature from what this page hands back. So the search is
 * passed through exactly as it arrived — dropping a parameter this page has
 * never heard of would invalidate a signature that covered it. Only `client_id`
 * is named, because it is the only one read here.
 */
interface AuthorizeSearch {
	client_id?: string;
}

export const Route = createFileRoute("/auth/authorize")({
	validateSearch: (search: Record<string, unknown>): AuthorizeSearch => search,
	// No bounce to sign in from here. The plugin sends a browser without a
	// session to the sign-in page instead, and the only way to arrive here
	// without one is a session that lapsed in between — at which point the
	// signed request is stale and the connection has to be started again anyway.
	beforeLoad: async () => ({ viewer: await getViewerFn() }),
	loaderDeps: ({ search }) => ({ clientId: search.client_id }),
	loader: async ({ context, deps }) => {
		if (!context.viewer || !deps.clientId) return { client: null };
		return { client: await getMcpClientFn({ data: { clientId: deps.clientId } }) };
	},
	head: ({ match }) => ({ meta: [{ title: buildTitle("Authorize", { appName: getAppName(match) }) }] }),
	component: AuthorizePage,
});

function AuthorizePage() {
	const search = Route.useSearch();
	const { viewer } = Route.useRouteContext();
	const { client } = Route.useLoaderData();
	const [connecting, setConnecting] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const label = client?.name?.trim() || "An MCP client";

	async function respond(accept: boolean) {
		setConnecting(true);
		setError(null);
		// The signed query rides along from the address bar: the auth client's
		// oauth-provider plugin picks out the parameters the signature covers and
		// sends them as `oauth_query`.
		const { data, error: failure } = await authClient.oauth2.consent({ accept });
		if (!data?.redirect || !data.url) {
			setError(failure?.message || "The authorization server refused the request.");
			setConnecting(false);
			return;
		}
		// A full-page navigation, not a fetch: the answer is the client's callback
		// URL, and only the browser can follow it there.
		window.location.href = data.url;
	}

	if (!viewer) {
		return (
			<FullPageCard title="You're signed out" subtitle="Start the connection from your MCP client again.">
				<Alert variant="destructive">
					<AlertDescription>
						This request was made for a session that has since ended, and signing back in won't revive it.
					</AlertDescription>
				</Alert>
			</FullPageCard>
		);
	}

	if (!search.client_id) {
		return (
			<FullPageCard title="Nothing to authorize" subtitle="Start the connection from your MCP client.">
				<Alert variant="destructive">
					<AlertDescription>This link is missing the client it was meant to authorize.</AlertDescription>
				</Alert>
			</FullPageCard>
		);
	}

	if (!client) {
		return (
			<FullPageCard title="Connect to Elmo" subtitle="This client isn't registered with this instance.">
				<Alert variant="destructive">
					<AlertDescription>
						Continuing will not work — start the connection from your MCP client again.
					</AlertDescription>
				</Alert>
			</FullPageCard>
		);
	}

	return (
		<FullPageCard title="Connect to Elmo" subtitle={`${label} is asking to read and manage your Elmo data.`}>
			<div className="w-full space-y-4">
				{error && (
					<Alert variant="destructive">
						<AlertDescription>{error}</AlertDescription>
					</Alert>
				)}
				<dl className="rounded-lg border bg-muted/40 p-4 text-sm space-y-2">
					<div className="flex flex-wrap items-baseline gap-x-2">
						<dt className="text-muted-foreground">Client</dt>
						<dd className="font-medium break-all">{label}</dd>
					</div>
					{client.redirectHosts.length ? (
						<div className="flex flex-wrap items-baseline gap-x-2">
							<dt className="text-muted-foreground">Sends you back to</dt>
							<dd className="font-mono text-xs break-all">{client.redirectHosts.join(", ")}</dd>
						</div>
					) : null}
				</dl>
				<p className="text-sm text-muted-foreground">
					It will act as you, in the workspaces you belong to. Revoke it by signing out of the client or removing its
					access from your account.
				</p>
				<div className="flex gap-2">
					<Button className="flex-1" onClick={() => respond(true)} disabled={connecting}>
						{connecting ? "Connecting…" : `Allow ${label}`}
					</Button>
					<Button className="flex-1" variant="outline" onClick={() => respond(false)} disabled={connecting}>
						Deny
					</Button>
				</div>
			</div>
		</FullPageCard>
	);
}
