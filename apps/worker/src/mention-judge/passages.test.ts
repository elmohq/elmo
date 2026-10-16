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
		expect(options[0]).toBe("1. Elmo Best overall starting point An MIT-licensed platform that tracks mentions.");
	});

	it("stops at the next company, so one company's quote never carries another's tone", () => {
		const options = quoteOptions(answer, matcher(peec), matcher(elmo));
		expect(options).toEqual(["2. Peec AI A polished dashboard, but it gets expensive."]);
	});

	it("offers a table row on its own", () => {
		expect(quoteOptions(answer, matcher(elmo), matcher(peec))).toContain("| Elmo | MIT |");
	});
});

describe("quoteOptions on citation chips", () => {
	it("doesn't offer a chip that only names a site", () => {
		const answer = sentences("Peec AI is a solid pick. It is fast. It is cheap.\n\n(techradar.com)");
		expect(quoteOptions(answer, matcher(peec), () => false)).toEqual([
			"Peec AI is a solid pick. It is fast. It is cheap.",
		]);
	});
});

describe("mentionOffsets", () => {
	it("finds every mention by name, alias or domain, in order", () => {
		const text = "Peec AI first. Then peec.ai again, and Peec.";
		expect(mentionOffsets(text, peec)).toEqual([0, 20, 39]);
	});

	it("doesn't count a link's target as naming a company, unless that's the only place it appears", () => {
		const text = "Sources: [review](https://example.com/peec-vs-elmo). Elmo leads.";
		expect(mentionOffsets(text, elmo)).toEqual([text.indexOf("Elmo leads")]);
		expect(mentionOffsets(text, peec)).toEqual([text.indexOf("peec-vs")]);
	});
});
