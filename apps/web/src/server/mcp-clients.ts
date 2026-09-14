/**
 * Clients register themselves, so a name here is an attacker-supplied claim.
 * The redirect host is not: it is read from the row the authorization endpoint
 * will actually redirect to, which is where the token ends up.
 */
import { createServerFn } from "@tanstack/react-start";
import { db } from "@workspace/lib/db/db";
import { oauthClient } from "@workspace/lib/db/schema";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { requireAuthSession } from "@/lib/auth/helpers";

export interface McpClientSummary {
	name: string | null;
	redirectHosts: string[];
}

export const getMcpClientFn = createServerFn({ method: "GET" })
	.validator(z.object({ clientId: z.string().min(1) }))
	.handler(async ({ data }): Promise<McpClientSummary | null> => {
		// Otherwise this is a directory of every client registered against the
		// instance.
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
							// Registration only validates the scheme, so showing the raw
							// string beats hiding that the client asked for something odd.
							return url.trim();
						}
					})
					.filter(Boolean),
			),
		];

		return { name: client.name || null, redirectHosts };
	});
