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
${overrides.updated ? `updated: "${overrides.updated}"\n` : ""}author: ${overrides.author ?? "ai"}
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
	assert.equal(parsed.updated, "");
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

test("validateDraftContent rejects an updated date on a new post", () => {
	assert.throws(
		() =>
			validateDraftContent({
				content: validDraft({ updated: "2026-07-24" }),
				filename: "packages/docs/content/blog/ai-search-source-selection-study.mdx",
				expectedDate: "2026-07-24",
				existingSlugs: ["ai-citations", "answer-engine-optimization"],
			}),
		/new post may not set updated/,
	);
});

test("validateDraftContent accepts a substantive refresh with new evidence", () => {
	const originalContent = validDraft({ date: "2026-06-01", author: "jrhizor" });
	const content = validDraft({ date: "2026-06-01", updated: "2026-07-24", author: "jrhizor" }).replace(
		"Teams can turn the finding into a small, repeatable measurement plan.",
		`Teams can turn the finding into a small, repeatable measurement plan. A newly published [evaluation appendix](https://benchmark.researcharchive.org/ai-search-evaluation) adds a separate benchmark, sampling notes, prompt categories, scoring definitions, retrieval observations, and reproducibility guidance. Those details materially narrow the original recommendation: teams should segment navigational and comparative prompts, record citation availability independently from answer presence, repeat measurements across several dates, document regional settings, and treat engine-level differences as hypotheses until their own prompt portfolio reproduces them.`,
	);

	const draft = validateDraftContent({
		content,
		filename: "packages/docs/content/blog/ai-search-source-selection-study.mdx",
		expectedDate: "2026-07-24",
		existingTitles: ["What Is Answer Engine Optimization?"],
		existingSlugs: ["ai-citations", "answer-engine-optimization"],
		operation: "refresh",
		originalContent,
	});

	assert.equal(draft.operation, "refresh");
	assert.equal(draft.updated, "2026-07-24");
	assert.ok(draft.changedWords >= 40);
	assert.deepEqual(draft.newEvidenceLinks, ["https://benchmark.researcharchive.org/ai-search-evaluation"]);
});

test("validateDraftContent rejects a timestamp-only refresh", () => {
	const originalContent = validDraft({ date: "2026-06-01" });
	const content = validDraft({ date: "2026-06-01", updated: "2026-07-24" });

	assert.throws(
		() =>
			validateDraftContent({
				content,
				filename: "packages/docs/content/blog/ai-search-source-selection-study.mdx",
				expectedDate: "2026-07-24",
				existingSlugs: ["ai-citations", "answer-engine-optimization"],
				operation: "refresh",
				originalContent,
			}),
		/new non-social[\s\S]*40 words of substantive body changes/,
	);
});

test("validateDraftContent preserves refresh publication metadata", () => {
	const originalContent = validDraft({ date: "2026-06-01", author: "jrhizor" });
	const content = validDraft({ date: "2026-06-02", updated: "2026-07-24", author: "ai" }).replace(
		"Teams can turn the finding into a small, repeatable measurement plan.",
		`Teams can use the new [evaluation appendix](https://benchmark.researcharchive.org/ai-search-evaluation) to build a more careful measurement plan with segmented prompts, repeated observations, documented settings, explicit scoring definitions, retrieval checks, regional controls, and confidence bounds. The added method is useful because it distinguishes citation availability from answer presence and makes engine-level comparisons easier to reproduce without turning one benchmark into a universal ranking claim.`,
	);

	assert.throws(
		() =>
			validateDraftContent({
				content,
				filename: "packages/docs/content/blog/ai-search-source-selection-study.mdx",
				expectedDate: "2026-07-24",
				existingSlugs: ["ai-citations", "answer-engine-optimization"],
				operation: "refresh",
				originalContent,
			}),
		/preserve the original publication date[\s\S]*preserve the original author/,
	);
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
