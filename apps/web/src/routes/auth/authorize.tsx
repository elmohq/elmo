/**
 * /auth/authorize — where the MCP OAuth flow asks a person to say yes.
 *
 * The better-auth `mcp` plugin sends a browser here when `/api/auth/mcp/authorize`
 * finds no session, carrying the OAuth request in the query string. This page
 * signs the person in if they aren't, shows them what is asking, and hands the
 * request straight back to the plugin — which is the only thing that mints a
 * code.
 *
 * Nothing about the request is interpreted here beyond naming the client. Every
 * other parameter is carried and handed back unread — validating them is the
 * plugin's job, and doing any of it twice is how the two get to disagree.
 *
 * The approval is a click, not a redirect. A page that bounced a signed-in
 * browser onward automatically would hand a token to anything that could get
 * that browser to load this URL; PKCE and registered redirect URIs make that
 * hard to exploit, but "hard to exploit" is not the bar for handing out access
 * to someone's data.
 */
import { createFileRoute, redirect } from "@tanstack/react-router";
import { Alert, AlertDescription } from "@workspace/ui/components/alert";
import { Button } from "@workspace/ui/components/button";
import { useState } from "react";
import { z } from "zod";
import FullPageCard from "@/components/full-page-card";
import { buildTitle, getAppName } from "@/lib/route-head";
import { getMcpClientFn } from "@/server/mcp-clients";
import { getViewerFn } from "@/server/viewer";

const AUTHORIZE_ENDPOINT = "/api/auth/mcp/authorize";

/**
 * Exactly the parameters `authorizeMCPOAuth` reads, declared so the router
 * keeps them in the URL rather than stripping them on the way through.
 *
 * A closed list, not a passthrough: TanStack unions every route's search schema
 * into one type, so an open one would give every page in the app an index
 * signature. Only `client_id` is used here — the rest are carried and handed
 * back untouched, which is why they are typed as strings and nothing more.
 */
const OAUTH_SEARCH = {
	client_id: z.string().optional(),
	response_type: z.string().optional(),
	redirect_uri: z.string().optional(),
	scope: z.string().optional(),
	state: z.string().optional(),
	prompt: z.string().optional(),
	code_challenge: z.string().optional(),
	code_challenge_method: z.string().optional(),
	nonce: z.string().optional(),
} as const;

export const Route = createFileRoute("/auth/authorize")({
	validateSearch: z.object(OAUTH_SEARCH),
	beforeLoad: async ({ location }) => {
		const viewer = await getViewerFn();
		if (!viewer) throw redirect({ to: "/auth/login", search: { returnTo: location.href } });
		return { viewer };
	},
	loaderDeps: ({ search }) => ({ clientId: search.client_id }),
	loader: async ({ deps }) => {
		if (!deps.clientId) return { client: null };
		return { client: await getMcpClientFn({ data: { clientId: deps.clientId } }) };
	},
	head: ({ match }) => ({ meta: [{ title: buildTitle("Authorize", { appName: getAppName(match) }) }] }),
	component: AuthorizePage,
});

function AuthorizePage() {
	const search = Route.useSearch();
	const { client } = Route.useLoaderData();
	const [connecting, setConnecting] = useState(false);

	const label = client?.name?.trim() || "An MCP client";

	if (!search.client_id) {
		return (
			<FullPageCard title="Nothing to authorize" subtitle="Start the connection from your MCP client.">
				<Alert variant="destructive">
					<AlertDescription>This link is missing the client it was meant to authorize.</AlertDescription>
				</Alert>
			</FullPageCard>
		);
	}

	function approve() {
		setConnecting(true);
		// A full-page navigation, not a fetch: the endpoint answers with a redirect
		// to the client's callback, and only the browser can follow that.
		const query = new URLSearchParams(
			Object.entries(search).flatMap(([key, value]) => (value === undefined ? [] : [[key, value] as [string, string]])),
		);
		window.location.href = `${AUTHORIZE_ENDPOINT}?${query.toString()}`;
	}

	return (
		<FullPageCard title="Connect to Elmo" subtitle={`${label} is asking to read and manage your Elmo data.`}>
			<div className="w-full space-y-4">
				<dl className="rounded-lg border bg-muted/40 p-4 text-sm space-y-2">
					<div className="flex flex-wrap items-baseline gap-x-2">
						<dt className="text-muted-foreground">Client</dt>
						<dd className="font-medium break-all">{label}</dd>
					</div>
					{client?.redirectHosts.length ? (
						<div className="flex flex-wrap items-baseline gap-x-2">
							<dt className="text-muted-foreground">Sends you back to</dt>
							<dd className="font-mono text-xs break-all">{client.redirectHosts.join(", ")}</dd>
						</div>
					) : null}
				</dl>
				{!client && (
					<Alert variant="destructive">
						<AlertDescription>
							This client isn't registered with this instance. Continuing will not work — start the connection from your
							MCP client again.
						</AlertDescription>
					</Alert>
				)}
				<p className="text-sm text-muted-foreground">
					It will act as you, in the workspaces you belong to. Revoke it by signing out of the client or removing its
					access from your account.
				</p>
				<Button className="w-full" onClick={approve} disabled={connecting || !client}>
					{connecting ? "Connecting…" : `Allow ${label}`}
				</Button>
			</div>
		</FullPageCard>
	);
}
