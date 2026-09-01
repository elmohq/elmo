/**
 * /auth/authorize — where the MCP OAuth flow asks a person to say yes.
 *
 * The better-auth `mcp` plugin sends a browser here twice. First, when
 * `/api/auth/mcp/authorize` finds no session, carrying the OAuth request in the
 * query string: this page signs the person in and hands the request straight
 * back to the plugin. Second, as the plugin's consent page, carrying a
 * `consent_code`: the show-what-is-asking-and-click step, which ends in
 * `POST /api/auth/oauth2/consent` — the endpoint that turns a consented request
 * into the code the client takes away.
 *
 * Nothing about the request is interpreted here beyond naming the client. Every
 * other parameter is carried and handed back unread — validating them is the
 * plugin's job, and doing any of it twice is how the two get to disagree.
 *
 * Only the consent step grants anything, and only from a click. The first hop
 * (which mints an unspendable consent request and comes straight back here)
 * is an automatic bounce: nothing it produces is a token, and the server only
 * ever returns it to this page, never to the client's redirect URI. An attacker
 * who gets a signed-in browser to load this URL therefore reaches the consent
 * screen — which is where the person says no.
 */
import { createFileRoute, redirect } from "@tanstack/react-router";
import { Alert, AlertDescription } from "@workspace/ui/components/alert";
import { Button } from "@workspace/ui/components/button";
import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import FullPageCard from "@/components/full-page-card";
import { buildTitle, getAppName } from "@/lib/route-head";
import { getMcpClientFn } from "@/server/mcp-clients";
import { getViewerFn } from "@/server/viewer";

const AUTHORIZE_ENDPOINT = "/api/auth/mcp/authorize";
const CONSENT_ENDPOINT = "/api/auth/oauth2/consent";

/**
 * Exactly the parameters the plugin reads, declared so the router keeps them in
 * the URL rather than stripping them on the way through.
 *
 * A closed list, not a passthrough: TanStack unions every route's search schema
 * into one type, so an open one would give every page in the app an index
 * signature. Only `client_id` and `consent_code` are used here — the rest are
 * carried and handed back untouched, which is why they are typed as strings and
 * nothing more.
 */
const OAUTH_SEARCH = {
	client_id: z.string().optional(),
	consent_code: z.string().optional(),
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
	const [error, setError] = useState<string | null>(null);
	/** Guards the bounce to the plugin so a redirect that lands back here without a consent code cannot loop. */
	const bounced = useRef(false);

	const label = client?.name?.trim() || "An MCP client";
	const consentCode = search.consent_code;

	// Mid-flow: hand the request to the plugin, which either bounces a
	// signed-out browser to sign in or comes straight back here with a consent
	// code to click on.
	useEffect(() => {
		if (consentCode || !search.client_id || !client || bounced.current) return;
		bounced.current = true;
		const query = new URLSearchParams(
			Object.entries(search).flatMap(([key, value]) => (value === undefined ? [] : [[key, value] as [string, string]])),
		);
		window.location.href = `${AUTHORIZE_ENDPOINT}?${query.toString()}`;
	}, [consentCode, search, client]);

	async function respond(accept: boolean) {
		if (!consentCode) return;
		setConnecting(true);
		setError(null);
		try {
			// A full-page navigation, not a fetch-first flow: the endpoint answers
			// with a redirect to the client's callback, and only the browser can
			// follow that.
			const response = await fetch(CONSENT_ENDPOINT, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ accept, consent_code: consentCode }),
			});
			const body = (await response.json()) as { redirectURI?: string; message?: string };
			if (!response.ok || !body.redirectURI) {
				throw new Error(body.message || "The authorization server refused the request.");
			}
			window.location.href = body.redirectURI;
		} catch (err) {
			setError(err instanceof Error && err.message ? err.message : "Couldn't reach the server. Try again.");
			setConnecting(false);
		}
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

	if (consentCode) {
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

	return (
		<FullPageCard title="Connect to Elmo" subtitle="Signing you in…">
			<Alert>
				<AlertDescription>
					<strong className="break-all">{label}</strong> is asking to connect. You'll be asked to allow it once you're
					signed in.
				</AlertDescription>
			</Alert>
		</FullPageCard>
	);
}
