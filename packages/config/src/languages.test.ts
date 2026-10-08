import { describe, expect, it } from "vitest";
import { DEFAULT_LANGUAGE, LANGUAGES, normalizeLanguageCode, parseLanguageFilter } from "./languages";

describe("languages", () => {
	it("offers the default language, each once", () => {
		expect(normalizeLanguageCode(DEFAULT_LANGUAGE)).toBe(DEFAULT_LANGUAGE);
		expect(new Set(LANGUAGES.map((l) => l.code.toLowerCase())).size).toBe(LANGUAGES.length);
	});

	it("accepts codes in any case and returns the canonical one", () => {
		expect(normalizeLanguageCode("ZH-cn")).toBe("zh-CN");
		expect(normalizeLanguageCode("DE")).toBe("de");
		expect(normalizeLanguageCode("pt")).toBeNull();
	});

	it("reads a filter from a link, keeping the languages it can still name", () => {
		expect(parseLanguageFilter("fr,xx,FR,pt-br")).toEqual(["fr", "pt-BR"]);
	});
});
