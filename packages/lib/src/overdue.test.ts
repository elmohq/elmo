import { describe, it, expect } from "vitest";
import { getModelOverdueStatus, isPromptOverdue } from "./overdue";

const HOUR = 60 * 60 * 1000;
const MINUTE = 60 * 1000;
const now = 1_000_000_000_000;
const runFrequencyMs = 24 * HOUR;
const createdLongAgo = new Date(now - 5 * 24 * HOUR);

describe("getModelOverdueStatus", () => {
	it("flags a never-run model once the prompt is past the grace window", () => {
		expect(getModelOverdueStatus({ lastRunAt: null, promptCreatedAt: createdLongAgo, runFrequencyMs, now })).toEqual({
			isOverdue: true,
			overdueByMs: null,
		});
	});

	it("does not flag a run within cadence", () => {
		expect(
			getModelOverdueStatus({
				lastRunAt: new Date(now - HOUR),
				promptCreatedAt: createdLongAgo,
				runFrequencyMs,
				now,
			}),
		).toEqual({ isOverdue: false, overdueByMs: null });
	});

	it("reports how far past cadence an overdue run is (dashboard view, no grace)", () => {
		expect(
			getModelOverdueStatus({
				lastRunAt: new Date(now - 25 * HOUR),
				promptCreatedAt: createdLongAgo,
				runFrequencyMs,
				now,
			}),
		).toEqual({ isOverdue: true, overdueByMs: HOUR });
	});

	it("holds off within the grace window and fires past it", () => {
		const graceMs = 30 * MINUTE;
		expect(
			getModelOverdueStatus({
				lastRunAt: new Date(now - (24 * HOUR + 10 * MINUTE)),
				promptCreatedAt: createdLongAgo,
				runFrequencyMs,
				now,
				graceMs,
			}).isOverdue,
		).toBe(false);
		expect(
			getModelOverdueStatus({
				lastRunAt: new Date(now - (24 * HOUR + 40 * MINUTE)),
				promptCreatedAt: createdLongAgo,
				runFrequencyMs,
				now,
				graceMs,
			}),
		).toEqual({ isOverdue: true, overdueByMs: 40 * MINUTE });
	});

	it("gives freshly-created prompts the grace window before flagging a missing run", () => {
		const graceMs = 30 * MINUTE;
		expect(
			getModelOverdueStatus({
				lastRunAt: null,
				promptCreatedAt: new Date(now - 20 * MINUTE),
				runFrequencyMs,
				now,
				graceMs,
			}).isOverdue,
		).toBe(false);
		expect(
			getModelOverdueStatus({
				lastRunAt: null,
				promptCreatedAt: new Date(now - 40 * MINUTE),
				runFrequencyMs,
				now,
				graceMs,
			}).isOverdue,
		).toBe(true);
	});
});

describe("isPromptOverdue", () => {
	it("is overdue when any single model is behind, even if another ran recently", () => {
		expect(
			isPromptOverdue({
				models: ["openai", "perplexity"],
				lastRunByModel: { openai: new Date(now - HOUR) },
				promptCreatedAt: createdLongAgo,
				runFrequencyMs,
				now,
			}),
		).toBe(true);
	});

	it("is on schedule when every model ran within cadence", () => {
		expect(
			isPromptOverdue({
				models: ["openai", "perplexity"],
				lastRunByModel: { openai: new Date(now - HOUR), perplexity: new Date(now - 2 * HOUR) },
				promptCreatedAt: createdLongAgo,
				runFrequencyMs,
				now,
			}),
		).toBe(false);
	});

	it("honors the grace window across models", () => {
		const lastRunByModel = { openai: new Date(now - (24 * HOUR + 10 * MINUTE)) };
		expect(
			isPromptOverdue({ models: ["openai"], lastRunByModel, promptCreatedAt: createdLongAgo, runFrequencyMs, now }),
		).toBe(true);
		expect(
			isPromptOverdue({
				models: ["openai"],
				lastRunByModel,
				promptCreatedAt: createdLongAgo,
				runFrequencyMs,
				now,
				graceMs: 30 * MINUTE,
			}),
		).toBe(false);
	});

	it("is never overdue with no configured models", () => {
		expect(
			isPromptOverdue({ models: [], lastRunByModel: {}, promptCreatedAt: createdLongAgo, runFrequencyMs, now }),
		).toBe(false);
	});
});
