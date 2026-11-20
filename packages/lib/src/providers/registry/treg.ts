import { randomUUID } from "node:crypto";
import { getCredential } from "../../secrets";
import { extractCitationsFromCloro } from "../../text-extraction";
import { configuredWhen, reportedWebQueries } from "../config";
import type { ModelConfig, Provider, ProviderOptions, ScrapeResult } from "../types";

const TREG_BING_URL = "https://treg.to/call/cloro.bing.serp.ai_mode";
const TREG_TIMEOUT_MS = 180_000;
const TREG_MAX_COST_USD = 0.01;
let purchases: Promise<void> = Promise.resolve();

function targetError(model: string, options?: ProviderOptions): string | null {
	if (model !== "bing-ai-mode") return 'Treg only supports model "bing-ai-mode"';
	if (options?.version !== undefined) return "bing-ai-mode:treg does not accept a version slug";
	if (options?.webSearch !== true) return "bing-ai-mode:treg requires :online";
	return null;
}

function maxCost(): number {
	const configured = getCredential("TREG_MAX_COST_USD");
	const cost = configured === undefined ? TREG_MAX_COST_USD : Number(configured);
	if (!Number.isFinite(cost) || cost <= 0 || cost > TREG_MAX_COST_USD) {
		throw new Error("TREG_MAX_COST_USD must be a positive finite number no greater than 0.01");
	}
	return cost;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}

function hasAnswer(result: Record<string, unknown>): boolean {
	return [result.text, result.markdown].some((value) => typeof value === "string" && value.trim().length > 0);
}

function observedCost(headers: Headers): number | null {
	const value = headers.get("X-Treg-Cost-Micro")?.trim();
	if (!value || !/^\d+$/.test(value)) return null;
	const cost = Number(value);
	return Number.isSafeInteger(cost) ? cost : null;
}

async function purchase(prompt: string, token: string, org: string, cost: number): Promise<ScrapeResult> {
	const idempotencyKey = randomUUID();
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), TREG_TIMEOUT_MS);
	let response: Response | undefined;
	const failure = (reason: string) =>
		new Error(
			`Treg ${reason} (HTTP ${response?.status ?? "unavailable"}; call ID ${response?.headers.get("X-Treg-Call-Id")?.trim() || "unavailable"}; idempotency key ${idempotencyKey}). Reconcile before retrying; no automatic retry was attempted.`,
		);

	try {
		try {
			response = await fetch(TREG_BING_URL, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"X-Treg-Token": token,
					"X-Treg-Org": org,
					"X-Treg-Route-Max-Cost": String(cost),
					"Idempotency-Key": idempotencyKey,
					"X-Treg-Meta": "application=elmo,feature=bing-ai-mode",
				},
				body: JSON.stringify({ prompt, country: "US", include: { markdown: true } }),
				signal: controller.signal,
				redirect: "error",
			});
		} catch {
			throw failure("request interrupted or timed out");
		}
		if (!response.ok) throw failure("request failed");

		const callId = response.headers.get("X-Treg-Call-Id")?.trim();
		if (!callId) throw failure("response is missing its audit call ID");
		let body: unknown;
		try {
			body = await response.json();
		} catch {
			throw failure("response could not be read as JSON");
		}
		if (!isRecord(body) || body.success !== true || !isRecord(body.result) || !hasAnswer(body.result)) {
			throw failure("response did not contain a successful nonempty Bing answer");
		}

		const result = body.result;
		return {
			rawOutput: {
				response: result,
				_treg: {
					call_id: callId,
					observed_charged_micro: observedCost(response.headers),
					idempotency_key: idempotencyKey,
				},
			},
			webQueries: reportedWebQueries([], { searchProven: extractCitationsFromCloro(result).length > 0 }),
			modelVersion: typeof result.model === "string" ? result.model : undefined,
		};
	} finally {
		clearTimeout(timeout);
	}
}

export const treg: Provider = {
	id: "treg",
	name: "Treg",
	access: "scraped",
	docsAnchor: "treg",
	isConfigured: configuredWhen("TREG_API_KEY", "TREG_ORG"),

	validateTarget(config: ModelConfig) {
		return targetError(config.model, config);
	},

	async run(model, prompt, options): Promise<ScrapeResult> {
		const error = targetError(model, options);
		if (error) throw new Error(error);
		let encodedPrompt: string;
		try {
			encodedPrompt = encodeURIComponent(prompt);
		} catch {
			throw new Error("Treg requires a valid Unicode prompt");
		}
		if (!prompt.trim() || encodedPrompt.length > 3500) {
			throw new Error("Treg requires a nonempty prompt of at most 3,500 URL-encoded characters");
		}
		const cost = maxCost();
		const token = getCredential("TREG_API_KEY");
		const org = getCredential("TREG_ORG");
		if (!token || !org) throw new Error("Treg requires TREG_API_KEY and TREG_ORG");

		// A rejected purchase must release the queue without resubmitting that purchase.
		const result = purchases.then(() => purchase(prompt, token, org, cost));
		purchases = result.then(
			() => undefined,
			() => undefined,
		);
		return result;
	},
};
