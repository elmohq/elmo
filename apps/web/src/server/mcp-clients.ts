import { createServerFn } from "@tanstack/react-start";
import { db } from "@workspace/lib/db/db";
import { oauthClient } from "@workspace/lib/db/schema";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { requireAuthSession } from "@/lib/auth/helpers";
import { type McpClientSummary, summarizeMcpClient } from "@/lib/mcp/client-summary";

export const getMcpClientFn = createServerFn({ method: "GET" })
	.validator(z.object({ clientId: z.string().min(1) }))
	.handler(async ({ data }): Promise<McpClientSummary | null> => {
		// Otherwise this is a directory of every client registered against the
		// instance.
		await requireAuthSession();

		const [client] = await db
			.select({
				clientId: oauthClient.clientId,
				clientDiscoveryId: oauthClient.clientDiscoveryId,
				name: oauthClient.name,
				redirectUris: oauthClient.redirectUris,
			})
			.from(oauthClient)
			.where(eq(oauthClient.clientId, data.clientId))
			.limit(1);
		return client ? summarizeMcpClient(client) : null;
	});
