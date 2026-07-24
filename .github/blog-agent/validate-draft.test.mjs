import assert from "node:assert/strict";
import test from "node:test";
import { parseFrontmatter, titleSimilarity, validateDraftContent } from "./validate-draft.mjs";

function validDraft(overrides = {}) {
	const paragraphs = Array.from(
		{ length: 70 },
		(_, index) =>
			`Evidence paragraph ${index + 1} explains how current AI search systems retrieve sources, why the finding matters to marketers, and which practical limitation readers should keep in mind when they evaluate the result.`,
	).join("\n\n");

	return `---
title: "A Fresh Study of AI Search Source Selection"
description: "A new study shows how AI search engines select sources and what marketers can learn without overgeneralizing the results."
date: "${overrides.date ?? "2026-07-24"}"
author: ai
metaTitle: "How AI Search Engines Select Sources"
tags:
  - aeo
  - ai-search
faq:
  - question: What did the study measure?
    answer: "It measured which sources appeared for a fixed set of prompts."
  - question: Does this apply to every AI answer engine?
    answer: "No. The sample and method limit how broadly the finding applies."
  - question: What should marketers do with the result?
    answer: "Use it to form a testable hypothesis, then measure their own prompts."
---

**Key takeaways**

- The study offers a useful, bounded result.
- Source selection differs by engine and prompt.
- Marketers should test the finding on their own prompt set.

Read the [original study](https://research.example.org/ai-search-study) and the [platform documentation](https://docs.example.net/search/sources) before applying the result. Our guides to [AI citations](/blog/ai-citations) and [answer engine optimization](/blog/answer-engine-optimization) explain the surrounding concepts.

## What the research measured

${paragraphs}

## What the result means

The result is useful when its sampling limits stay visible.

## How to apply it

Teams can turn the finding into a small, repeatable measurement plan.
`;
}

test("parseFrontmatter reads the fields used by the blog schema", () => {
	const parsed = parseFrontmatter(validDraft());
	assert.equal(parsed.title, "A Fresh Study of AI Search Source Selection");
	assert.equal(parsed.date, "2026-07-24");
	assert.equal(parsed.author, "ai");
	assert.deepEqual(parsed.tags, ["aeo", "ai-search"]);
	assert.equal(parsed.faqCount, 3);
});

test("validateDraftContent accepts an evidence-led draft", () => {
	const draft = validateDraftContent({
		content: validDraft(),
		filename: "packages/docs/content/blog/ai-search-source-selection-study.mdx",
		expectedDate: "2026-07-24",
		existingTitles: ["What Is Answer Engine Optimization?"],
		existingSlugs: ["ai-citations", "answer-engine-optimization"],
	});

	assert.equal(draft.slug, "ai-search-source-selection-study");
	assert.ok(draft.wordCount >= 1_000);
	assert.equal(draft.evidenceLinks.length, 2);
	assert.equal(draft.internalBlogLinks.length, 2);
});

test("validateDraftContent rejects stale dates and social-only evidence", () => {
	const content = validDraft({ date: "2026-07-23" })
		.replace("https://research.example.org/ai-search-study", "https://reddit.com/r/seo/comments/123")
		.replace("https://docs.example.net/search/sources", "https://x.com/example/status/456");

	assert.throws(
		() =>
			validateDraftContent({
				content,
				filename: "packages/docs/content/blog/ai-search-source-selection-study.mdx",
				expectedDate: "2026-07-24",
				existingSlugs: ["ai-citations", "answer-engine-optimization"],
			}),
		/date must be 2026-07-24[\s\S]*two distinct non-social/,
	);
});

test("titleSimilarity catches near-duplicate article concepts", () => {
	assert.ok(
		titleSimilarity("How AI Search Engines Select Sources", "How Do AI Search Engines Select Their Sources?") >= 0.65,
	);
	assert.ok(titleSimilarity("AI Citation Volatility", "How to Measure Brand Sentiment") < 0.3);
});
