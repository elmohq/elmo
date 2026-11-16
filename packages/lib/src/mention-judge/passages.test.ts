import { describe, expect, it } from "vitest";
import { matcher, mentionOffsets, quoteOptions, sentences } from "./passages";

const elmo = { name: "Elmo", aliases: [], domains: ["https://www.elmohq.com"] };
const peec = { name: "Peec", aliases: ["Peec AI"], domains: ["peec.ai"] };

describe("matcher", () => {
	it("matches names, aliases and domains as whole words", () => {
		const names = matcher(peec);
		expect(names("Try Peec AI today")).toBe(true);
		expect(names("see peec.ai/pricing")).toBe(true);
		expect(names("Peeking at dashboards")).toBe(false);
		expect(matcher({ name: "Zorb", aliases: [], domains: ["acme.co"] })("see acme.com")).toBe(false);
	});
});

describe("quoteOptions", () => {
	const answer = sentences(
		[
			"1. Elmo",
			"-------",
			"",
			"Best overall starting point",
			"",
			"An MIT-licensed platform that tracks mentions. Teams like that every metric is auditable.",
			"",
			"2. Peec AI",
			"----------",
			"",
			"A polished dashboard, but it gets expensive.",
			"",
			"| Tool | License |",
			"| Elmo | MIT |",
		].join("\n"),
	);

	it("offers a heading together with the description under it", () => {
		const options = quoteOptions(answer, matcher(elmo), matcher(peec));
		expect(options[0].text).toBe("1. Elmo Best overall starting point An MIT-licensed platform that tracks mentions.");
	});

	it("stops at the next company, so one company's quote never carries another's tone", () => {
		const options = quoteOptions(answer, matcher(peec), matcher(elmo));
		expect(options.map((option) => option.text)).toEqual(["2. Peec AI A polished dashboard, but it gets expensive."]);
	});

	it("offers a table row on its own", () => {
		expect(quoteOptions(answer, matcher(elmo), matcher(peec)).map((option) => option.text)).toContain("| Elmo | MIT |");
	});
});

describe("quoteOptions on citation chips", () => {
	it("doesn't offer a chip that only names a site", () => {
		const answer = sentences("Peec AI is a solid pick. It is fast. It is cheap.\n\n(techradar.com)");
		expect(quoteOptions(answer, matcher(peec), () => false).map((option) => option.text)).toEqual([
			"Peec AI is a solid pick. It is fast. It is cheap.",
		]);
	});
});

describe("quoteOptions, whatever the answer's shape", () => {
	const quotes = (text: string) =>
		quoteOptions(sentences(text), matcher(elmo), matcher(peec)).map((option) => option.text);

	it("reads plain paragraphs", () => {
		expect(quotes("Some tools exist. Elmo is open source. It is free to run. Peec AI costs more.")).toEqual([
			"Elmo is open source. It is free to run.",
		]);
	});

	it("reads list items", () => {
		expect(quotes("- Elmo: open source and free.\n- Peec AI: polished but pricey.")).toEqual([
			"- Elmo: open source and free.",
		]);
	});

	it("keeps trailing citations with their sentence", () => {
		expect(quotes("Elmo is open source.[1] (github.com) Peec AI is not. (peec.ai)")).toEqual([
			"Elmo is open source.[1] (github.com)",
		]);
	});

	it("splits text without spaces between sentences, as Chinese and Japanese write it", () => {
		expect(quotes("Elmo是开源的。Peec AI更贵。")).toEqual(["Elmo是开源的。"]);
	});

	it("gives each quote's place in the text", () => {
		const text = "Intro here. Elmo is open source.";
		const [option] = quoteOptions(sentences(text), matcher(elmo), () => false);
		expect(text.slice(option.start, option.end)).toBe("Elmo is open source.");
	});
});

describe("mentionOffsets", () => {
	it("finds every mention by name, alias or domain, in order", () => {
		const text = "Peec AI first. Then peec.ai again, and Peec.";
		expect(mentionOffsets(text, peec)).toEqual([0, 20, 39]);
	});

	it("doesn't find a name among inline image data", () => {
		const text = `![x](data:image/png;base64,${"A".repeat(3000)}ElmoAAA) Then Elmo.`;
		expect(mentionOffsets(text, elmo)).toEqual([text.indexOf("Then Elmo") + 5]);
	});

	it("doesn't count a link's target as naming a company, unless that's the only place it appears", () => {
		const text = "Sources: [review](https://example.com/peec-vs-elmo). Elmo leads.";
		expect(mentionOffsets(text, elmo)).toEqual([text.indexOf("Elmo leads")]);
		expect(mentionOffsets(text, peec)).toEqual([text.indexOf("peec-vs")]);
	});
});
