import { describe, expect, it } from "vitest";
import { codeFencesBalanced, estimateTokens, hasFrontmatter, llmsTxtShape, looksLikeHtml } from "./markdown";

describe("hasFrontmatter", () => {
	it("detects a frontmatter block at the start of the file", () => {
		expect(hasFrontmatter("---\ntitle: Docs\n---\n# Docs\n")).toBe(true);
	});

	it("accepts Windows line endings and a leading byte-order mark", () => {
		expect(hasFrontmatter("---\r\ntitle: Docs\r\n---\r\n# Docs\r\n")).toBe(true);
		expect(hasFrontmatter("\uFEFF---\ntitle: Docs\n---\n# Docs\n")).toBe(true);
	});

	it("returns false when there is no frontmatter block", () => {
		expect(hasFrontmatter("# Docs\n")).toBe(false);
		expect(hasFrontmatter("")).toBe(false);
	});

	it("returns false when the frontmatter block is unclosed, missing a trailing newline, or not at the start", () => {
		expect(hasFrontmatter("---\ntitle: Docs\n# Docs\n")).toBe(false);
		expect(hasFrontmatter("# Docs\n\n---\ntitle: Docs\n---\n")).toBe(false);
		expect(hasFrontmatter("---\ntitle: Docs\n---")).toBe(false);
	});
});

describe("codeFencesBalanced", () => {
	it("returns true when there are no code fences", () => {
		expect(codeFencesBalanced("# Docs\n\nNo code here.")).toBe(true);
		expect(codeFencesBalanced("")).toBe(true);
	});

	it("accepts balanced backtick and tilde fences, including Windows line endings", () => {
		expect(codeFencesBalanced("```ts\nconst a = 1;\n```\n")).toBe(true);
		expect(codeFencesBalanced("~~~\ncode\n~~~\n")).toBe(true);
		expect(codeFencesBalanced("```\r\ncode\r\n```\r\n")).toBe(true);
	});

	it("reports a fence that is never closed", () => {
		expect(codeFencesBalanced("```ts\nconst a = 1;\n")).toBe(false);
	});

	it("doesn't let a tilde fence close a backtick fence", () => {
		expect(codeFencesBalanced("```\ncode\n~~~\n")).toBe(false);
	});

	it("requires a closing fence to be at least as long as the opening fence", () => {
		expect(codeFencesBalanced("````\n```\nnested\n```\n````\n")).toBe(true);
		expect(codeFencesBalanced("````\ncode\n```\n")).toBe(false);
		expect(codeFencesBalanced("```\ncode\n`````\n")).toBe(true);
	});

	it("treats up to three leading spaces as a fence and four spaces as indented code", () => {
		expect(codeFencesBalanced("   ```\ncode\n   ```\n")).toBe(true);
		expect(codeFencesBalanced("    ```\ncode\n")).toBe(true);
	});
});

describe("llmsTxtShape", () => {
	it("detects an H1, summary line, and Markdown link items in a well-formed file", () => {
		const llmsTxt = [
			"# Example",
			"",
			"> Example makes widgets.",
			"",
			"## Docs",
			"",
			"- [Quickstart](https://example.com/quickstart.md)",
			"- [API](https://example.com/api.md): The API reference",
			"",
		].join("\n");

		expect(llmsTxtShape(llmsTxt)).toEqual({ h1: true, summary: true, linkItems: 2 });
	});

	it("reports nothing for an empty file", () => {
		expect(llmsTxtShape("")).toEqual({ h1: false, summary: false, linkItems: 0 });
	});

	it("requires an H1 with a space as the first non-blank line", () => {
		expect(llmsTxtShape("\n\n# Example\n").h1).toBe(true);
		expect(llmsTxtShape("## Example\n").h1).toBe(false);
		expect(llmsTxtShape("#Example\n").h1).toBe(false);
		expect(llmsTxtShape("Intro\n# Example\n").h1).toBe(false);
	});

	it("reports no summary when no blockquote line is present", () => {
		expect(llmsTxtShape("# Example\nSome text\n").summary).toBe(false);
	});

	it("counts asterisk bullets and indented list items containing links", () => {
		expect(
			llmsTxtShape("* [Docs](https://example.com/docs.md)\n  - [Guide](https://example.com/guide.md)\n").linkItems,
		).toBe(2);
	});

	it("ignores links outside list items and list items without links", () => {
		expect(llmsTxtShape("See [Docs](https://example.com/docs.md)\n- Docs\n").linkItems).toBe(0);
	});
});

describe("looksLikeHtml", () => {
	it("detects HTML doctypes and opening html tags regardless of case, whitespace, or attributes", () => {
		expect(looksLikeHtml("<!DOCTYPE html><html></html>")).toBe(true);
		expect(looksLikeHtml("<!doctype html>")).toBe(true);
		expect(looksLikeHtml("<HTML>")).toBe(true);
		expect(looksLikeHtml('\n  <html lang="en">')).toBe(true);
	});

	it("returns false for non-HTML text, similar tag names, HTML later in the body, and empty input", () => {
		expect(looksLikeHtml("<htmlfoo>")).toBe(false);
		expect(looksLikeHtml("User-agent: *\nDisallow:")).toBe(false);
		expect(looksLikeHtml("# Docs\n<html>")).toBe(false);
		expect(looksLikeHtml("")).toBe(false);
	});
});

describe("estimateTokens", () => {
	it("estimates tokens as character count divided by four, rounded up", () => {
		expect(estimateTokens("")).toBe(0);
		expect(estimateTokens("a")).toBe(1);
		expect(estimateTokens("abcd")).toBe(1);
		expect(estimateTokens("abcde")).toBe(2);
		expect(estimateTokens("a".repeat(400))).toBe(100);
	});
});
