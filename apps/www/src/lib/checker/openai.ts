import { hostOf } from "./mentions";
import type { Source } from "./types";

const RESPONSES_URL = "https://api.openai.com/v1/responses";
// Same model the product uses for its ChatGPT target, so the free check sees
// roughly what an Elmo Cloud ChatGPT run would.
const DEFAULT_MODEL = "gpt-6-luna";

export const PROMPT_COUNT = 5;

export function checkerModel(): string {
	return process.env.AI_VISIBILITY_CHECKER_MODEL || DEFAULT_MODEL;
}

interface ResponseContent {
	type: string;
	text?: string;
	annotations?: { type: string; url?: string; title?: string }[];
}

interface ResponsesApiResult {
	output?: { type: string; content?: ResponseContent[] }[];
	error?: { message?: string } | null;
}

async function createResponse(body: Record<string, unknown>, timeoutMs: number): Promise<ResponsesApiResult> {
	const apiKey = process.env.OPENAI_API_KEY;
	if (!apiKey) throw new Error("OPENAI_API_KEY is not set");
	const response = await fetch(RESPONSES_URL, {
		method: "POST",
		headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
		body: JSON.stringify({ model: checkerModel(), store: false, ...body }),
		signal: AbortSignal.timeout(timeoutMs),
	});
	const json = (await response.json().catch(() => ({}))) as ResponsesApiResult;
	if (!response.ok) throw new Error(`OpenAI ${response.status}: ${json.error?.message ?? "request failed"}`);
	return json;
}

function outputParts(result: ResponsesApiResult): ResponseContent[] {
	return (result.output ?? [])
		.filter((item) => item.type === "message")
		.flatMap((item) => item.content ?? [])
		.filter((part) => part.type === "output_text");
}

async function structured<T>(name: string, schema: Record<string, unknown>, input: string): Promise<T> {
	const result = await createResponse(
		{
			input,
			max_output_tokens: 4000,
			text: { format: { type: "json_schema", name, schema, strict: true } },
		},
		45_000,
	);
	const text = outputParts(result)
		.map((part) => part.text ?? "")
		.join("");
	return JSON.parse(text) as T;
}

export interface BrandProfile {
	brandName: string;
	aliases: string[];
	category: string;
	prompts: string[];
}

export function profileBrand(input: {
	domain: string;
	title: string;
	description: string;
	brandName?: string;
	category?: string;
}): Promise<BrandProfile> {
	const overrides = [
		input.brandName ? `The brand name is "${input.brandName}".` : "",
		input.category ? `The category is "${input.category}".` : "",
	]
		.filter(Boolean)
		.join(" ");
	return structured<BrandProfile>(
		"brand_profile",
		{
			type: "object",
			additionalProperties: false,
			required: ["brandName", "aliases", "category", "prompts"],
			properties: {
				brandName: { type: "string", description: "The brand's name as customers write it." },
				aliases: {
					type: "array",
					items: { type: "string" },
					description: "Other names the brand goes by (product names, abbreviations). Can be empty.",
				},
				category: {
					type: "string",
					description: "What the brand sells, in 2-5 words, e.g. 'project management software'.",
				},
				prompts: { type: "array", items: { type: "string" }, description: `Exactly ${PROMPT_COUNT} prompts.` },
			},
		},
		`You are setting up an AI visibility check for the website ${input.domain}.
Homepage title: ${input.title || "(unavailable)"}
Homepage description: ${input.description || "(unavailable)"}
${overrides}

Identify the brand and what it sells. Then write exactly ${PROMPT_COUNT} questions a real potential customer would type into ChatGPT while choosing what to buy in this category, where a good answer would recommend specific companies or products.

Rules for the questions:
- Never include the brand's own name: the point is to see whether AI recommends it unprompted.
- Mix intents: "best X for Y", a specific use case or audience, a comparison or "alternatives to <a well-known competitor>", and a price or feature constraint.
- Be specific to this category and its likely buyers and region, written the way people actually type.`,
	);
}

export interface Answer {
	text: string;
	sources: Source[];
}

/** Ask the prompt the way a user would, with web search on, like ChatGPT search. */
export async function answerPrompt(prompt: string): Promise<Answer> {
	const result = await createResponse(
		{
			input: prompt,
			tools: [{ type: "web_search", search_context_size: "low" }],
			max_tool_calls: 2,
			max_output_tokens: 6000,
		},
		90_000,
	);
	const parts = outputParts(result);
	const sources = new Map<string, Source>();
	for (const annotation of parts.flatMap((part) => part.annotations ?? [])) {
		if (annotation.type !== "url_citation" || !annotation.url) continue;
		const url = annotation.url.replace(/[?&]utm_source=openai$/, "");
		const domain = hostOf(url);
		if (domain && !sources.has(url)) sources.set(url, { url, domain, title: annotation.title });
	}
	return { text: parts.map((part) => part.text ?? "").join("\n"), sources: [...sources.values()] };
}

/** The companies and products each answer names, in one cheap batched call. */
export async function extractBrandNames(answers: string[]): Promise<string[][]> {
	const { answers: extracted } = await structured<{ answers: { index: number; brands: string[] }[] }>(
		"named_brands",
		{
			type: "object",
			additionalProperties: false,
			required: ["answers"],
			properties: {
				answers: {
					type: "array",
					items: {
						type: "object",
						additionalProperties: false,
						required: ["index", "brands"],
						properties: { index: { type: "integer" }, brands: { type: "array", items: { type: "string" } } },
					},
				},
			},
		},
		`For each numbered answer below, list every company, product, or service brand it names as an option for the reader, using the name as written in the answer. Leave out websites that are only cited as sources, and generic categories.

${answers.map((answer, index) => `<answer index="${index}">\n${answer.slice(0, 6000)}\n</answer>`).join("\n\n")}`,
	);
	return answers.map((_, index) => extracted.find((entry) => entry.index === index)?.brands ?? []);
}
