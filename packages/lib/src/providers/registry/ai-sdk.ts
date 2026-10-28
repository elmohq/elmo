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

const RESEARCH_SCHEMA_NAME = "research_output";

export function jsonSchemaResponseFormat(schema: z.ZodType): Record<string, unknown> {
	return {
		type: "json_schema",
		json_schema: { name: RESEARCH_SCHEMA_NAME, strict: true, schema: z.toJSONSchema(schema) },
	};
}

export function parseSchemaJson<T>(schema: z.ZodType<T>, content: string): T {
	return schema.parse(JSON.parse(content));
}
