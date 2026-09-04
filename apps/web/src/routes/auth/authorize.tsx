/**
 * Only `POST /api/auth/oauth2/consent` turns the signed request into a code, and
 * only a click sends it — so loading this URL on someone's behalf reaches the
 * consent screen, which is where they say no.
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

/** A passthrough: the plugin signs the whole query, so dropping a parameter this
 * page never heard of would invalidate the signature. */
interface AuthorizeSearch {
	client_id?: string;
}

export const Route = createFileRoute("/auth/authorize")({
	validateSearch: (search: Record<string, unknown>): AuthorizeSearch => search,
	// The plugin sends a signed-out browser to the sign-in page, so arriving here
	// without a session means it lapsed and the request is stale.
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
		const { data, error: failure } = await authClient.oauth2.consent({ accept });
		if (!data?.redirect || !data.url) {
			setError(failure?.message || "The authorization server refused the request.");
			setConnecting(false);
			return;
		}
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
					<div className="flex flex-wrap items-baseline gap-x-2">
						<dt className="text-muted-foreground">Identity</dt>
						{client.publisherHost ? (
							<dd className="font-mono text-xs break-all">{client.publisherHost}</dd>
						) : (
							<dd>Unverified — it named itself</dd>
						)}
					</div>
					{client.redirectHosts.length ? (
						<div className="flex flex-wrap items-baseline gap-x-2">
							<dt className="text-muted-foreground">Sends you back to</dt>
							<dd className="font-mono text-xs break-all">{client.redirectHosts.join(", ")}</dd>
						</div>
					) : null}
				</dl>
				{client.loopbackOnly && (
					<Alert>
						<AlertDescription>
							This client runs on your computer, so Elmo can't tell which program is asking. Continue only if you just
							started this from a client you trust.
						</AlertDescription>
					</Alert>
				)}
				<p className="text-sm text-muted-foreground">
					{client.publisherHost
						? `Its name and callback address come from a document it publishes at ${client.publisherHost}. `
						: null}
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
