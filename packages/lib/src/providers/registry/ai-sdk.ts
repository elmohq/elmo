/**
 * The parts of a structured-research call that don't vary by vendor.
 *
 * Two shapes exist: providers reached through the AI SDK (`structuredResearch`)
 * and providers called over raw HTTP because the SDK can't carry a
 * vendor-specific field (`jsonSchemaResponseFormat` + `parseSchemaJson`). Both
 * ask for the same thing — one call, one Zod-validated object.
 */
import { generateText, type LanguageModel, Output, type ToolSet } from "ai";
import { z } from "zod";

type GenerateTextArgs = Parameters<typeof generateText>[0];

export interface StructuredResearchCall<T> {
	prompt: string;
	schema: z.ZodType<T>;
	tools?: ToolSet;
	providerOptions?: GenerateTextArgs["providerOptions"];
}

export async function structuredResearch<T>(
	model: LanguageModel,
	{ prompt, schema, tools, providerOptions }: StructuredResearchCall<T>,
): Promise<T> {
	const result = await generateText({
		model,
		prompt,
		output: Output.object({ schema }),
		...(tools ? { tools } : {}),
		...(providerOptions ? { providerOptions } : {}),
	});
	return result.output as T;
}

/** Name the strict JSON-schema response format is registered under. */
const RESEARCH_SCHEMA_NAME = "research_output";

/** The OpenAI-compatible `response_format` for a server-validated Zod schema. */
export function jsonSchemaResponseFormat(schema: z.ZodType): Record<string, unknown> {
	return {
		type: "json_schema",
		json_schema: { name: RESEARCH_SCHEMA_NAME, strict: true, schema: z.toJSONSchema(schema) },
	};
}

/** Validate a JSON-schema response body against the schema that requested it. */
export function parseSchemaJson<T>(schema: z.ZodType<T>, content: string): T {
	return schema.parse(JSON.parse(content));
}
