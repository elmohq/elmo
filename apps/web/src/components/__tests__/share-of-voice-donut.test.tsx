import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ShareOfVoiceDonut } from "@/components/share-of-voice-donut";

const entry = (name: string, mentions: number, isBrand = false) => ({ name, mentions, share: 0, isBrand, prompts: 1 });

const ariaLabel = (html: string) => html.match(/aria-label="([^"]*)"/)?.[1];

describe("ShareOfVoiceDonut", () => {
	it("reads out every slice, the long tail as Others, with the percentages it lists", () => {
		const html = renderToStaticMarkup(
			<ShareOfVoiceDonut
				entries={[
					entry("HubSpot", 30),
					entry("Acme", 25, true),
					entry("Salesforce", 20),
					entry("Pipedrive", 10),
					entry("Zoho", 5),
					entry("Freshworks", 6),
					entry("Close", 4),
				]}
				colors={new Map()}
				topN={4}
			/>,
		);
		expect(ariaLabel(html)).toBe(
			"Share of voice: HubSpot 30%, Acme 25%, Salesforce 20%, Pipedrive 10%, Zoho 5%, Others 10%",
		);
		for (const listed of ["30%", "25%", "20%", "10%", "5%"]) expect(html).toContain(`>${listed}<`);
	});

	it("leaves Others out of the summary when nobody is past the top competitors", () => {
		const html = renderToStaticMarkup(
			<ShareOfVoiceDonut entries={[entry("Acme", 3, true), entry("Globex", 1)]} colors={new Map()} />,
		);
		expect(ariaLabel(html)).toBe("Share of voice: Acme 75%, Globex 25%");
	});
});
