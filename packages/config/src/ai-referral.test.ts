import { describe, expect, it } from "vitest";
import { detectAiAssistant } from "./ai-referral";

const detect = (referrer: string, search = "") => detectAiAssistant({ referrer, search });

describe("detectAiAssistant", () => {
	it.each([
		["https://chatgpt.com/", "ChatGPT"],
		["https://chat.openai.com/c/abc", "ChatGPT"],
		["https://www.perplexity.ai/search/xyz", "Perplexity"],
		["https://claude.ai/", "Claude"],
		["https://gemini.google.com/app", "Gemini"],
		["https://copilot.microsoft.com/", "Copilot"],
		["https://chat.deepseek.com/", "DeepSeek"],
		["https://grok.com/", "Grok"],
		["https://www.meta.ai/", "Meta AI"],
		["https://you.com/", "You.com"],
		["https://www.phind.com/", "Phind"],
		["https://www.doubao.com/chat/", "Doubao"],
		["https://www.kimi.com/", "Kimi"],
		["https://kimi.moonshot.cn/", "Kimi"],
	])("names the assistant for a referrer of %s", (referrer, assistant) => {
		expect(detect(referrer)).toBe(assistant);
	});

	it.each([
		["?utm_source=chatgpt.com", "ChatGPT"],
		["?utm_source=perplexity", "Perplexity"],
		["?utm_source=copilot.com", "Copilot"],
		["?utm_source=Claude.ai&utm_medium=referral", "Claude"],
	])("names the assistant for %s when there is no referrer", (search, assistant) => {
		expect(detect("", search)).toBe(assistant);
	});

	it("prefers the referrer over the utm_source", () => {
		expect(detect("https://claude.ai/", "?utm_source=chatgpt.com")).toBe("Claude");
	});

	it.each([
		["https://www.google.com/", ""],
		["https://elmohq.com/pricing", ""],
		["https://notchatgpt.com/", ""],
		["", "?utm_source=newsletter"],
		["not a url", ""],
		["", ""],
	])("ignores non-AI traffic (%s %s)", (referrer, search) => {
		expect(detect(referrer, search)).toBeNull();
	});
});
