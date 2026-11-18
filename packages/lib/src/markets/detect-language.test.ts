import { describe, expect, it } from "vitest";
import { detectPromptLanguage } from "./detect-language";

const detect = (text: string, brandLanguage = "en", ignore: string[] = []) =>
	detectPromptLanguage(text, { brandLanguage, ignore });

describe("detectPromptLanguage", () => {
	it("names the language of a prompt clearly written in another one", async () => {
		expect(await detect("bestes CRM für kleine Unternehmen")).toBe("de");
		expect(await detect("mejor crm para pequeñas empresas")).toBe("es");
		expect(await detect("meilleur CRM pour PME")).toBe("fr");
		expect(await detect("中小企業向けの最高のCRM")).toBe("ja");
	});

	it("leaves a prompt in the brand's language following the brand", async () => {
		expect(await detect("best crm for small business")).toBeNull();
		expect(await detect("bestes CRM für kleine Unternehmen", "de")).toBeNull();
	});

	it("doesn't mistake short English prompts made of product names for another language", async () => {
		for (const prompt of [
			"asana vs monday",
			"stripe vs paypal fees",
			"adidas ultraboost review",
			"lululemon leggings sizing",
			"hubspot pricing",
		]) {
			expect(await detect(prompt), prompt).toBeNull();
		}
	});

	it("judges the words around brand and competitor names, not the names", async () => {
		expect(await detect("Salesforce Alternativen für kleine Unternehmen", "en", ["Salesforce"])).toBe("de");
		expect(await detect("Zapatos Rápidos review", "en", ["Zapatos Rápidos"])).toBeNull();
	});

	it("finds an English prompt under a brand whose language is another", async () => {
		expect(await detect("what is the best email marketing tool for a small team", "de")).toBe("en");
	});
});
