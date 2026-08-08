import { describe, expect, it } from "vitest";
import { matchAcceptLanguage, resolveLocale } from "./locale";

describe("matchAcceptLanguage", () => {
	it("matches exact and regional Simplified Chinese preferences", () => {
		expect(matchAcceptLanguage("zh-CN,zh;q=0.9,en;q=0.8")).toBe("zh-CN");
		expect(matchAcceptLanguage("zh-Hans-SG;q=0.9,en;q=0.8")).toBe("zh-CN");
		expect(matchAcceptLanguage("zh-SG,en;q=0.8")).toBe("zh-CN");
	});

	it("matches Traditional Chinese preferences", () => {
		expect(matchAcceptLanguage("zh-TW,zh;q=0.9,en;q=0.8")).toBe("zh-TW");
		expect(matchAcceptLanguage("zh-Hant-HK;q=0.9,en;q=0.8")).toBe("zh-TW");
		expect(matchAcceptLanguage("zh-HK,en;q=0.8")).toBe("zh-TW");
	});

	it("matches Spanish and Japanese regional preferences", () => {
		expect(matchAcceptLanguage("es-MX,es;q=0.9,en;q=0.8")).toBe("es");
		expect(matchAcceptLanguage("ja-JP,ja;q=0.9,en;q=0.8")).toBe("ja");
	});

	it("honors quality values and ignores unsupported languages", () => {
		expect(matchAcceptLanguage("fr-FR, en-US;q=0.7, zh-CN;q=0.8")).toBe("zh-CN");
		expect(matchAcceptLanguage("fr-FR, de;q=0.8")).toBeUndefined();
	});
});

describe("resolveLocale", () => {
	it("gives an explicit user preference highest priority", () => {
		expect(resolveLocale({ preference: "ja", acceptLanguage: "zh-CN", systemDefault: "es" })).toBe("ja");
	});

	it("uses the browser for auto and then the system default", () => {
		expect(resolveLocale({ preference: "auto", acceptLanguage: "zh-CN", systemDefault: "en" })).toBe("zh-CN");
		expect(resolveLocale({ preference: "auto", acceptLanguage: "fr", systemDefault: "zh-TW" })).toBe("zh-TW");
	});

	it("falls back safely when persisted values are invalid", () => {
		expect(resolveLocale({ preference: "invalid", acceptLanguage: "fr", systemDefault: "invalid" })).toBe("en");
	});
});
