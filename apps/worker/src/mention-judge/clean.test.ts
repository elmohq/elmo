import { describe, expect, it } from "vitest";
import { cleanAnswer, locatePassage } from "./clean";

describe("cleanAnswer", () => {
	it("keeps the site a citation chip cites, so a brand cited only that way still reads as named", () => {
		expect(cleanAnswer("![](https://www.google.com/s2/favicons?domain=https://www.elmohq.com&sz=32) Elmo +2")).toBe(
			"(elmohq.com) Elmo +2",
		);
	});

	it("keeps an image's caption, which can name a product, and drops inline image data", () => {
		expect(
			cleanAnswer(
				"* [![Nike Kids' Flex Runner 4](data:image/jpeg;base64,/9j/4AAQ)](/search?ibp=oshop&prds=pvt:a) - great.",
			),
		).toBe("* (image: Nike Kids' Flex Runner 4) - great.");
	});

	it("keeps a link's text and the site it points to, but not a relative link's target", () => {
		expect(cleanAnswer("See [Elmo](https://www.elmohq.com/docs) or [the shop](/search?q=x).")).toBe(
			"See Elmo (elmohq.com) or the shop.",
		);
	});

	it("copes with brackets in captions, parentheses in URLs, and links the answer broke", () => {
		expect(cleanAnswer("![Top Tools [With Use Cases]](https://img.example/x.png)")).toBe(
			"(image: Top Tools [With Use Cases])",
		);
		expect(cleanAnswer("[Nike](https://en.wikipedia.org/wiki/Nike_(mythology)) myth")).toBe(
			"Nike (en.wikipedia.org) myth",
		);
		expect(cleanAnswer("\\[ Saucony Ride 18 \\](https://www.dickssporting goods.com/x) – reliable")).toBe(
			"Saucony Ride 18 – reliable",
		);
	});

	it("leaves no link or image markup behind", () => {
		const cleaned = cleanAnswer(
			"Read [docs](https://a.example/b) ![](https://c.example/d.png) https://e.example/f [![x](data:image/png;base64,AAAA)](https://g.example)",
		);
		expect(cleaned).not.toMatch(/\]\(|https?:\/\/|base64/);
	});
});

describe("locatePassage", () => {
	const answer = "Intro.\n\n1. **Elmo**\n-------\n\nBest overall · [MIT](https://github.com/elmohq/elmo) license.\n";

	it("finds a passage of the cleaned answer in the original, across the markup cleaning removed", () => {
		const passage = locatePassage(answer, "1. Elmo Best overall · MIT (github.com) license.");
		expect(passage && answer.slice(passage.start, passage.end)).toBe(
			"1. **Elmo**\n-------\n\nBest overall · [MIT](https://github.com/elmohq/elmo) license",
		);
	});

	it("keeps offsets right after text whose lowercase form is a different length", () => {
		const text = "İstanbul has shops. Elmo is great value there.";
		const passage = locatePassage(text, "Elmo is great value there.");
		expect(passage && text.slice(passage.start, passage.end)).toBe("Elmo is great value there");
	});

	it("finds a passage that spans inline image data", () => {
		const text = `**Elmo is the best tracker** . [r](https://reddit.com/x) ![](data:image/png;base64,${"A".repeat(2000)}) Reddit +1 It is free.`;
		const passage = locatePassage(text, cleanAnswer(text));
		expect(passage && text.slice(passage.start, passage.end)).toMatch(/^Elmo.*It is free$/s);
	});

	it("picks the passage itself, not a looser run of the same words starting earlier", () => {
		const text = "Best pick overall here. Value matters. Best value shoe is great.";
		const passage = locatePassage(text, "Best value shoe is great.");
		expect(passage && text.slice(passage.start, passage.end)).toBe("Best value shoe is great");
	});

	it("finds a passage whose source glued two words together", () => {
		const text = "Carbon fuel. The[Adidas Adios Pro 4](/search?q=x) is a durable rival to Nike's marathon tier.";
		const passage = locatePassage(text, "TheAdidas Adios Pro 4 is a durable rival to Nike's marathon tier.");
		expect(passage && text.slice(passage.start, passage.end)).toBe(
			"The[Adidas Adios Pro 4](/search?q=x) is a durable rival to Nike's marathon tier",
		);
	});

	it("finds nothing for a passage that isn't in the answer", () => {
		expect(locatePassage(answer, "Something else entirely")).toBeUndefined();
	});
});
