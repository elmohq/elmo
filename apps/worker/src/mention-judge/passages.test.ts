import { describe, expect, it } from "vitest";
import { matcher, mentionOffsets, quoteOptions, sentences } from "./passages";

const elmo = { name: "Elmo", aliases: [], domains: ["https://www.elmohq.com"] };
const peec = { name: "Peec", aliases: ["Peec AI"], domains: ["peec.ai"] };

describe("matcher", () => {
	it("matches whole-word names and aliases, and domains anywhere", () => {
		const names = matcher(peec);
		expect(names("Try Peec AI today")).toBe(true);
		expect(names("see peec.ai/pricing")).toBe(true);
		expect(names("Peeking at dashboards")).toBe(false);
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

describe("mentionOffsets", () => {
	it("finds every mention by name, alias or domain, in order", () => {
		const text = "Peec AI first. Then peec.ai again, and Peec.";
		expect(mentionOffsets(text, peec)).toEqual([0, 20, 39]);
	});
});
