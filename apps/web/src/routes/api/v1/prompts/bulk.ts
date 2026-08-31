/**
 * POST /api/v1/prompts/bulk — create up to 100 prompts for one brand.
 *
 * All-or-nothing. The batch is checked against the organization's prompt and
 * premium pools as a single delta and applied in one transaction, so a batch
 * that would overrun a limit creates nothing rather than part of itself and
 * leaves the caller guessing how far it got.
 */
import { createFileRoute } from "@tanstack/react-router";
import { createApiHandler, withMethodGuard } from "@/lib/api/handler";
import { requireBrandInScope } from "@/lib/api/scope";
import { bulkPromptInputSchema, createPrompts } from "@/server/prompts-core";

export const Route = createFileRoute("/api/v1/prompts/bulk")({
	server: {
		handlers: withMethodGuard({
			POST: createApiHandler({
				body: bulkPromptInputSchema,
				status: 201,
				scopes: ["prompts:write"],
				handle: async ({ body, auth }) => {
					const brand = await requireBrandInScope(auth, body.brandId, "body");
					return { data: await createPrompts(brand, { prompts: body.prompts }) };
				},
			}),
		}),
	},
});
