import { describe, expect, it } from "vitest";
import { cleanAnswer, originalSpan } from "./clean";

const clean = (answer: string) => cleanAnswer(answer).text;

describe("cleanAnswer", () => {
	it("keeps the site a citation chip cites, so a brand cited only that way still reads as named", () => {
		expect(clean("![](https://www.google.com/s2/favicons?domain=https://www.elmohq.com&sz=32) Elmo +2")).toBe(
			"(elmohq.com) Elmo +2",
		);
		expect(clean("Great boots ([rei.com](https://www.rei.com/p/1?utm_source=chatgpt.com)).")).toBe(
			"Great boots (rei.com).",
		);
		expect(clean("A solid pick.[[1]](https://a.example/x)")).toBe("A solid pick.(a.example)");
	});

	it("keeps an image's caption, which can name a product, and drops inline image data", () => {
		expect(
			clean("* [![Nike Kids' Flex Runner 4](data:image/jpeg;base64,/9j/4AAQ)](/search?ibp=oshop&prds=pvt:a) - great."),
		).toBe("* (image: Nike Kids' Flex Runner 4) - great.");
	});

	it("keeps a link's text and the site it points to, but not a relative link's target", () => {
		expect(clean("See [Elmo](https://www.elmohq.com/docs) or [the shop](/search?q=x).")).toBe(
			"See Elmo (elmohq.com) or the shop.",
		);
	});

	it("copes with brackets in captions, parentheses in URLs, and links the answer broke", () => {
		expect(clean("![Top Tools [With Use Cases]](https://img.example/x.png)")).toBe(
			"(image: Top Tools [With Use Cases])",
		);
		expect(clean("[Nike](https://en.wikipedia.org/wiki/Nike_(mythology)) myth")).toBe("Nike (en.wikipedia.org) myth");
		expect(clean("\\[ Saucony Ride 18 \\](https://www.dickssporting goods.com/x) – reliable")).toBe(
			"Saucony Ride 18 – reliable",
		);
	});

	it("reads escapes, entities, tags and citation tokens as the text they stand for", () => {
		expect(clean("1\\. Nike\\'s \\_best\\_ shoe &amp; Hoka&#39;s <b>pick</b>【4†source】")).toBe(
			"1. Nike's _best_ shoe & Hoka's pick",
		);
	});

	it("keeps CJK brackets that aren't citations, and drops ChatGPT's private-use citation markers", () => {
		expect(clean("【公式】ユニクロ and ![【asics 亞瑟士】THE MUSEUM](https://img.example/a.png)")).toBe(
			"【公式】ユニクロ and (image: 【asics 亞瑟士】THE MUSEUM)",
		);
		expect(clean("Nike leads.\ue200cite\ue202turn0search1\ue201 Then Adidas.")).toBe("Nike leads. Then Adidas.");
	});

	it("keeps words apart across HTML cells and paragraphs, and reads hex entities and autolinks", () => {
		expect(clean("<td>Date</td><td>AI</td> pick.</p><p>Brooks &#x27;s")).toBe("Date AI pick. Brooks 's");
		expect(clean("See <https://nike.com/x> or [https://ahrefs.com/x](https://ahrefs.com/x).")).toBe(
			"See nike.com or ahrefs.com.",
		);
		expect(clean("Open `http://localhost:3000` in a browser.")).toBe("Open `localhost` in a browser.");
	});

	it("stays fast on long runs of whitespace", () => {
		const started = performance.now();
		clean(`a${"\n".repeat(100_000)}b${" ".repeat(100_000)}c${"\u00a0".repeat(100_000)}`);
		expect(performance.now() - started).toBeLessThan(2_000);
	});

	it("rejoins a sentence the source broke over lines, but not separate lines", () => {
		expect(clean("Try the\n\n[Brooks Ghost 16](/search?q=x)\n\n, and the Hoka.")).toBe(
			"Try the\n\nBrooks Ghost 16 , and the Hoka.",
		);
		expect(clean("It eases symptoms\n. However, \nvalerian works too.")).toBe(
			"It eases symptoms . However, valerian works too.",
		);
		expect(clean("Shop online\n\nadidas Originals Forum, 4.8 stars")).toBe(
			"Shop online\n\nadidas Originals Forum, 4.8 stars",
		);
	});

	it("leaves no link or image markup behind", () => {
		expect(
			clean(
				"Read [docs](https://a.example/b) ![](https://c.example/d.png) https://e.example/f [![x](data:image/png;base64,AAAA)](https://g.example)",
			),
		).not.toMatch(/\]\(|https?:\/\/|base64/);
	});
});

describe("originalSpan", () => {
	const span = (answer: string, quote: string) => {
		const cleaned = cleanAnswer(answer);
		const start = cleaned.text.indexOf(quote);
		const { start: from, end } = originalSpan(cleaned, start, start + quote.length);
		return answer.slice(from, end);
	};

	it("maps a passage of the cleaned answer back to the original, markup and all", () => {
		const answer = "Intro.\n\n1. **Elmo** is best · [MIT](https://github.com/elmohq/elmo) licensed.\n";
		expect(span(answer, "Elmo** is best · MIT (github.com) licensed.")).toBe(
			"Elmo** is best · [MIT](https://github.com/elmohq/elmo) licensed.",
		);
	});

	it("never starts or ends inside a link or image", () => {
		const answer =
			"The [Adidas Adios Pro 4](/search?q=x) is fast. ![Nike Pegasus](data:image/png;base64,AAAA) Nike rocks.";
		expect(span(answer, "Adidas Adios")).toBe("[Adidas Adios Pro 4](/search?q=x)");
		expect(span(answer, "Pegasus) Nike rocks.")).toBe("![Nike Pegasus](data:image/png;base64,AAAA) Nike rocks.");
	});

	it("keeps offsets right after text whose lowercase form is a different length", () => {
		const answer = "İstanbul has shops. Elmo is great value there.";
		expect(span(answer, "Elmo is great value there.")).toBe("Elmo is great value there.");
	});
});
