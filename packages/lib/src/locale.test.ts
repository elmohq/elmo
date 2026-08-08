import { describe, expect, it } from "vitest";
import { matchAcceptLanguage, resolveLocale } from "./locale";

describe("matchAcceptLanguage", () => {
	it("matches exact and regional Simplified Chinese preferences", () => {
		expect(matchAcceptLanguage("zh-CN,zh;q=0.9,en;q=0.8")).toBe("zh-CN");
		expect(matchAcceptLanguage("zh-Hans-SG;q=0.9,en;q=0.8")).toBe("zh-CN");
	});

	it("honors quality values and ignores unsupported languages", () => {
		expect(matchAcceptLanguage("fr-FR, en-US;q=0.7, zh-CN;q=0.8")).toBe("zh-CN");
		expect(matchAcceptLanguage("fr-FR, de;q=0.8")).toBeUndefined();
	});
});

describe("resolveLocale", () => {
	it("gives an explicit user preference highest priority", () => {
		expect(resolveLocale({ preference: "en", acceptLanguage: "zh-CN", systemDefault: "zh-CN" })).toBe("en");
	});

	it("uses the browser for auto and then the system default", () => {
		expect(resolveLocale({ preference: "auto", acceptLanguage: "zh-CN", systemDefault: "en" })).toBe("zh-CN");
		expect(resolveLocale({ preference: "auto", acceptLanguage: "fr", systemDefault: "zh-CN" })).toBe("zh-CN");
	});

	it("falls back safely when persisted values are invalid", () => {
		expect(resolveLocale({ preference: "invalid", acceptLanguage: "fr", systemDefault: "invalid" })).toBe("en");
	});
});
