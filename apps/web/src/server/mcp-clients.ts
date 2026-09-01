/**
 * What the consent screen needs to know about an MCP client.
 *
 * Clients register themselves — that is what dynamic client registration is —
 * so everything here is attacker-supplied and is shown as a claim, never as an
 * identity. The one fact that isn't is the redirect host, which is read from
 * the row the authorization endpoint will actually redirect to. That is the
 * field worth reading: a name can say anything, but the host is where the token
 * ends up.
 */
import { createServerFn } from "@tanstack/react-start";
import { db } from "@workspace/lib/db/db";
import { oauthClient } from "@workspace/lib/db/schema";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { requireAuthSession } from "@/lib/auth/helpers";

export interface McpClientSummary {
	name: string | null;
	/** The hosts this client's tokens can be delivered to. */
	redirectHosts: string[];
}

export const getMcpClientFn = createServerFn({ method: "GET" })
	.validator(z.object({ clientId: z.string().min(1) }))
	.handler(async ({ data }): Promise<McpClientSummary | null> => {
		// Signed-in only: this is reached from the consent screen, and an
		// unauthenticated lookup would turn it into a directory of every client
		// registered against the instance.
		await requireAuthSession();

		const [client] = await db
			.select({ name: oauthClient.name, redirectUris: oauthClient.redirectUris })
			.from(oauthClient)
			.where(eq(oauthClient.clientId, data.clientId))
			.limit(1);
		if (!client) return null;

		const redirectHosts = [
			...new Set(
				client.redirectUris
					.map((url) => {
						try {
							return new URL(url.trim()).host;
						} catch {
							// A registration is only validated for scheme, so a redirect
							// URL that doesn't parse is possible. Showing the raw string is
							// better than hiding that the client asked for something odd.
							return url.trim();
						}
					})
					.filter(Boolean),
			),
		];

		return { name: client.name || null, redirectHosts };
	});
