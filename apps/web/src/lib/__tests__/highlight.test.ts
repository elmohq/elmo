import { describe, expect, it } from "vitest";
import { rehypeHighlight, rehypeMarkRange, splitHighlights } from "@/lib/highlight";

interface Node {
	type: string;
	tagName?: string;
	value?: string;
	properties?: Record<string, unknown>;
	children?: Node[];
	position?: { start: { offset?: number }; end: { offset?: number } };
}

const text = (value: string, start?: number, end?: number): Node =>
	start === undefined || end === undefined
		? { type: "text", value }
		: { type: "text", value, position: { start: { offset: start }, end: { offset: end } } };
const el = (tagName: string, ...children: Node[]): Node => ({ type: "element", tagName, properties: {}, children });
const p = (...children: Node[]) => el("p", ...children);
const root = (...children: Node[]): Node => ({ type: "root", children });
const mark = (value: string): Node => el("mark", text(value));

describe("splitHighlights", () => {
	it("matches regardless of case but keeps the original casing", () => {
		expect(splitHighlights("Acme and ACME and acme", "acme")).toEqual([
			{ text: "Acme", match: true },
			{ text: " and ", match: false },
			{ text: "ACME", match: true },
			{ text: " and ", match: false },
			{ text: "acme", match: true },
		]);
	});

	it("returns the whole text unmatched when there is no term", () => {
		expect(splitHighlights("hello", "")).toEqual([{ text: "hello", match: false }]);
	});

	it("returns the whole text unmatched when the term doesn't occur", () => {
		expect(splitHighlights("Try Acme today", "globex")).toEqual([{ text: "Try Acme today", match: false }]);
	});

	it("has no parts for empty text", () => {
		expect(splitHighlights("", "acme")).toEqual([]);
	});

	it("doesn't overlap matches", () => {
		expect(splitHighlights("aaa", "aa")).toEqual([
			{ text: "aa", match: true },
			{ text: "a", match: false },
		]);
	});

	it("gives back the original text when the parts are joined", () => {
		const original = "Acme beats acme-like rivals, says ACME.";
		expect(
			splitHighlights(original, "acme")
				.map((part) => part.text)
				.join(""),
		).toBe(original);
	});
});

describe("rehypeHighlight", () => {
	it("wraps each match in a mark holding the matched text", () => {
		const tree = root(p(text("Try Acme today, Acme")));
		rehypeHighlight("acme")()(tree);
		expect(tree.children?.[0].children).toEqual([text("Try "), mark("Acme"), text(" today, "), mark("Acme")]);
	});

	it("marks a match nested inside bold text", () => {
		const tree = root(p(text("Try "), el("strong", text("Acme now"))));
		rehypeHighlight("acme")()(tree);
		expect(tree).toEqual(root(p(text("Try "), el("strong", mark("Acme"), text(" now")))));
	});

	it("leaves elements and unmatched text as they were", () => {
		const image: Node = { type: "element", tagName: "img", properties: { src: "a.png" } };
		const comment: Node = { type: "comment", value: "Acme" };
		const tree = root(p(text("Nothing here"), image), comment);
		rehypeHighlight("acme")()(tree);
		expect(tree).toEqual(root(p(text("Nothing here"), image), comment));
	});
});

describe("rehypeMarkRange", () => {
	const className = "passage";
	const passage = (value: string): Node => ({
		type: "element",
		tagName: "mark",
		properties: { className: [className], dataPassage: true },
		children: [text(value)],
	});
	const markRange = (start: number, end: number, tree: Node) => {
		rehypeMarkRange({ start, end, className })()(tree);
		return tree;
	};

	it("splits a text node that is partly inside the range", () => {
		const tree = markRange(16, 24, root(p(text("Hello world", 10, 21))));
		expect(tree.children?.[0].children).toEqual([text("Hello "), passage("world")]);
	});

	it("keeps the plain text on both sides of a range inside one node", () => {
		const tree = markRange(14, 19, root(p(text("Try Acme Pro today", 10, 28))));
		expect(tree.children?.[0].children).toEqual([text("Try "), passage("Acme "), text("Pro today")]);
	});

	it("marks a whole node that falls inside the range", () => {
		const tree = markRange(0, 100, root(p(text("Acme", 10, 14))));
		expect(tree.children?.[0].children).toEqual([passage("Acme")]);
	});

	it("marks text nested inside other elements", () => {
		const tree = markRange(12, 16, root(p(text("A ", 10, 12), el("strong", text("Acme", 12, 16)))));
		expect(tree).toEqual(root(p(text("A ", 10, 12), el("strong", passage("Acme")))));
	});

	it("leaves a text node outside the range unchanged", () => {
		const before = text("Hello", 0, 5);
		const after = text("there", 30, 35);
		const tree = markRange(5, 30, root(p(before, after)));
		expect(tree.children?.[0].children?.[0]).toBe(before);
		expect(tree.children?.[0].children?.[1]).toBe(after);
	});

	it("leaves a text node without a source position unchanged", () => {
		const unpositioned = text("Hello world");
		const tree = markRange(0, 100, root(p(unpositioned)));
		expect(tree.children?.[0].children?.[0]).toBe(unpositioned);
	});

	it("marks an escaped character whole instead of slicing it", () => {
		const tree = markRange(10, 22, root(p(text("&", 21, 26))));
		expect(tree.children?.[0].children).toEqual([passage("&")]);
	});
});
