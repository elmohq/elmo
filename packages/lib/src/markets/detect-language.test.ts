import { describe, expect, it } from "vitest";
import { detectLanguage } from "./detect-language";

describe("detectLanguage", () => {
	it("names the language a prompt is clearly written in", async () => {
		expect(await detectLanguage("bestes CRM für kleine Unternehmen")).toBe("de");
		expect(await detectLanguage("mejor crm para pequeñas empresas")).toBe("es");
		expect(await detectLanguage("meilleur CRM pour PME")).toBe("fr");
		expect(await detectLanguage("中小企業向けの最高のCRM")).toBe("ja");
		expect(await detectLanguage("what is the best email marketing tool for a small team")).toBe("en");
	});

	it("doesn't mistake short English prompts made of product names for another language", async () => {
		for (const prompt of [
			"asana vs monday",
			"stripe vs paypal fees",
			"adidas ultraboost review",
			"lululemon leggings sizing",
			"hubspot pricing",
		]) {
			expect([null, "en"], prompt).toContain(await detectLanguage(prompt));
		}
	});

	it("judges the words around brand and competitor names, not the names", async () => {
		expect(await detectLanguage("Salesforce Alternativen für kleine Unternehmen", ["Salesforce"])).toBe("de");
		expect([null, "en"]).toContain(await detectLanguage("Zapatos Rápidos review", ["Zapatos Rápidos"]));
	});

	it("doesn't guess between languages it can't tell apart", async () => {
		expect(await detectLanguage("sepatu lari terbaik untuk pemula")).toBeNull();
		expect(await detectLanguage("najbolji crm za mala preduzeća")).toBeNull();
	});
});
