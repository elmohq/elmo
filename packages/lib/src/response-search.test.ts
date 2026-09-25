import { describe, expect, it } from "vitest";
import { storableResponseText } from "./response-search";
import { extractTextContent } from "./text-extraction";

const PROVIDERS = [
	"openai-api",
	"anthropic-api",
	"mistral-api",
	"dataforseo",
	"openrouter",
	"searchapi",
	"olostep",
	"brightdata",
	"oxylabs",
	"cloro",
	"some-future-provider",
];

describe("storableResponseText", () => {
	it.each(PROVIDERS)("indexes nothing for a %s run with no answer", (provider) => {
		expect(storableResponseText(extractTextContent({}, provider))).toBe("");
		expect(storableResponseText(extractTextContent(null, provider))).toBe("");
	});

	it("indexes a real answer as extracted", () => {
		const raw = { content: [{ type: "text", text: "No content in this answer is a placeholder." }] };
		expect(storableResponseText(extractTextContent(raw, "anthropic-api"))).toBe(
			"No content in this answer is a placeholder.",
		);
	});

	it("drops NUL bytes Postgres can't store", () => {
		expect(storableResponseText("Acme\u0000 is great")).toBe("Acme is great");
	});
});
