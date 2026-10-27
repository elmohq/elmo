import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { parseDomainInput } from "@/lib/checker/domain";
import {
	cachedResult,
	cacheResult,
	clientIp,
	consumeCheckQuota,
	resultCacheKey,
	verifyTurnstile,
} from "@/lib/checker/guard";
import { checkerConfigured, runCheck } from "@/lib/checker/run";
import type { CheckEvent } from "@/lib/checker/types";

const bodySchema = z.object({
	domain: z.string().max(300),
	brandName: z.string().trim().max(80).optional(),
	category: z.string().trim().max(80).optional(),
	turnstileToken: z.string().max(4096).optional(),
});

function jsonError(message: string, status: number): Response {
	return Response.json({ error: message }, { status, headers: { "Cache-Control": "no-store" } });
}

async function handle(request: Request): Promise<Response> {
	if (!checkerConfigured()) return jsonError("The checker is temporarily unavailable.", 503);

	const parsedBody = bodySchema.safeParse(await request.json().catch(() => null));
	if (!parsedBody.success) return jsonError("Enter a website domain to check.", 400);
	const body = parsedBody.data;

	const domain = parseDomainInput(body.domain);
	if (!domain.ok) return jsonError(domain.error, 400);

	const ip = clientIp(request);
	if (!(await verifyTurnstile(body.turnstileToken, ip))) {
		return jsonError("We couldn't verify you're human. Refresh the page and try again.", 403);
	}

	const input = {
		domain: domain.domain,
		host: domain.host,
		brandName: body.brandName || undefined,
		category: body.category || undefined,
	};
	const key = resultCacheKey(input);
	const cached = await cachedResult(key);

	if (!cached) {
		const quota = await consumeCheckQuota(ip);
		if (!quota.ok) return jsonError(quota.message, 429);
	}

	const encoder = new TextEncoder();
	const stream = new ReadableStream<Uint8Array>({
		async start(controller) {
			let open = true;
			const emit = (event: CheckEvent) => {
				if (open) controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
			};
			try {
				if (cached) {
					emit({ type: "result", result: cached, cached: true });
				} else {
					const result = await runCheck(input, emit);
					emit({ type: "result", result, cached: false });
					if (!result.sample) await cacheResult(key, result);
				}
			} catch (error) {
				console.error("[ai-visibility-checker] check failed", error);
				emit({ type: "error", message: "Something went wrong running the check. Please try again in a minute." });
			} finally {
				open = false;
				controller.close();
			}
		},
	});

	return new Response(stream, {
		headers: {
			"Content-Type": "application/x-ndjson; charset=utf-8",
			"Cache-Control": "no-store",
			"X-Robots-Tag": "noindex",
		},
	});
}

export const Route = createFileRoute("/api/tools/ai-visibility-checker")({
	server: {
		handlers: {
			POST: ({ request }) => handle(request),
		},
	},
});
