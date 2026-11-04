import { describe, expect, it } from "vitest";
import {
	coercePromptOrder,
	DEFAULT_PROMPT_ORDER,
	type OrderablePrompt,
	orderPrompts,
	PROMPT_ORDER_OPTIONS,
} from "@/lib/prompt-order";

const prompt = (value: string, overrides: Partial<OrderablePrompt> = {}) => ({
	value,
	brandMentionRate: 0,
	competitorMentionRate: 0,
	averageWeightedMentions: 0,
	...overrides,
});

const values = (prompts: OrderablePrompt[]) => prompts.map((p) => p.value);

describe("coercePromptOrder", () => {
	it("keeps every order the menu offers", () => {
		for (const option of PROMPT_ORDER_OPTIONS) {
			expect(coercePromptOrder(option.value)).toBe(option.value);
		}
	});

	it("falls back to the default order for anything else", () => {
		expect(DEFAULT_PROMPT_ORDER).toBe("default");
		for (const raw of ["newest", "", undefined, null, 42]) {
			expect(coercePromptOrder(raw)).toBe(DEFAULT_PROMPT_ORDER);
		}
	});
});

describe("orderPrompts", () => {
	const brandList = [
		prompt("cheap flights", { brandMentionRate: 0.5, averageWeightedMentions: 1 }),
		prompt("zero waste tips", { brandMentionRate: 0.1, averageWeightedMentions: 9 }),
		prompt("how to brew coffee", { brandMentionRate: 0.9, averageWeightedMentions: 0 }),
		prompt("best running shoes", { brandMentionRate: 0.5, averageWeightedMentions: 1 }),
		prompt("affordable laptops", { brandMentionRate: 0.5, averageWeightedMentions: 3 }),
	];

	const competitorList = [
		prompt("cheap flights", { competitorMentionRate: 0.2 }),
		prompt("zero waste tips", { competitorMentionRate: 0.8 }),
		prompt("how to brew coffee", { competitorMentionRate: 0.2 }),
		prompt("affordable laptops", { competitorMentionRate: 0.5 }),
	];

	it("keeps the given order by default", () => {
		expect(values(orderPrompts(brandList, "default"))).toEqual(values(brandList));
	});

	it("never changes the list it was given", () => {
		for (const option of PROMPT_ORDER_OPTIONS) {
			const list = [...brandList];
			orderPrompts(list, option.value);
			expect(list).toEqual(brandList);
		}
	});

	it("puts the highest brand visibility first", () => {
		expect(values(orderPrompts(brandList, "brand-desc"))[0]).toBe("how to brew coffee");
		expect(values(orderPrompts(brandList, "brand-desc")).at(-1)).toBe("zero waste tips");
	});

	it("breaks brand visibility ties by weighted mentions, then alphabetically", () => {
		expect(values(orderPrompts(brandList, "brand-desc"))).toEqual([
			"how to brew coffee",
			"affordable laptops",
			"best running shoes",
			"cheap flights",
			"zero waste tips",
		]);
	});

	it("puts the lowest brand visibility and weighted mentions first, still breaking ties A–Z", () => {
		expect(values(orderPrompts(brandList, "brand-asc"))).toEqual([
			"zero waste tips",
			"best running shoes",
			"cheap flights",
			"affordable laptops",
			"how to brew coffee",
		]);
	});

	it("orders by competitor visibility highest first, breaking ties A–Z", () => {
		expect(values(orderPrompts(competitorList, "competitor-desc"))).toEqual([
			"zero waste tips",
			"affordable laptops",
			"cheap flights",
			"how to brew coffee",
		]);
	});

	it("orders by competitor visibility lowest first, breaking ties A–Z", () => {
		expect(values(orderPrompts(competitorList, "competitor-asc"))).toEqual([
			"cheap flights",
			"how to brew coffee",
			"affordable laptops",
			"zero waste tips",
		]);
	});

	it("orders prompts alphabetically", () => {
		expect(values(orderPrompts(brandList, "prompt-asc"))).toEqual([
			"affordable laptops",
			"best running shoes",
			"cheap flights",
			"how to brew coffee",
			"zero waste tips",
		]);
	});

	it("orders prompts in reverse alphabetical order", () => {
		expect(values(orderPrompts(brandList, "prompt-desc"))).toEqual([
			"zero waste tips",
			"how to brew coffee",
			"cheap flights",
			"best running shoes",
			"affordable laptops",
		]);
	});

	it("keeps every field of each prompt", () => {
		const withIds = [
			{ ...prompt("how to brew coffee"), id: "prompt-2" },
			{ ...prompt("best running shoes"), id: "prompt-1" },
		];
		expect(orderPrompts(withIds, "prompt-asc")).toEqual([withIds[1], withIds[0]]);
	});
});
