import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { UnigramTokenizer } from "./tokenizer";

/**
 * Ids from the Hugging Face tokenizer for the same `tokenizer.json`, which the model was trained
 * with: any drift here means the model reads different input than it learned from.
 */
const SINGLES: [text: string, ids: number[]][] = [
	["Acme is the easiest CRM to set up.", [63290, 269, 262, 7382, 12656, 264, 487, 322, 260]],
	["  two  spaces\tand\nnewlines  ", [375, 3654, 263, 353, 17480]],
	["İstanbul café naïve", [117621, 15924, 34972]],
	["emoji 🚀 rocket", [30151, 507, 124758, 9613]],
	[
		"acme.com/pricing (see [Acme](https://acme.com))",
		[
			110318, 260, 549, 320, 71181, 287, 3302, 647, 25687, 3831, 592, 555, 13229, 294, 320, 320, 6504, 3831, 260, 549,
			285, 285,
		],
	],
	["Ünïcödé — dashes – and “quotes”", [66599, 673, 29861, 1207, 16846, 48377, 533, 59317, 377, 263, 317, 63466, 318]],
	["xxxunknown ʬʬ glyphs", [77264, 54026, 507, 3, 78884]],
];
const PAIRS: [entity: string, passage: string, ids: number[]][] = [
	[
		"Acme | aka Acme Corp | site acme.com",
		"Acme is great.",
		[1, 63290, 1540, 13458, 63290, 6071, 1540, 566, 110318, 260, 549, 2, 63290, 269, 426, 260, 2],
	],
	[
		"Globex | competitors Acme",
		"I have no information about Globex.",
		[1, 12140, 982, 1540, 5772, 63290, 2, 273, 286, 363, 439, 314, 12140, 982, 260, 2],
	],
];

const dir = process.env.MENTION_JUDGE_DIR;

describe.skipIf(!dir)("tokenizer parity with Hugging Face", () => {
	const tokenizer = dir ? UnigramTokenizer.fromFile(join(dir, "tokenizer.json")) : null;
	it.each(SINGLES)("encodes %j", (text, ids) => {
		expect(tokenizer?.encode(text)).toEqual(ids);
	});
	it.each(PAIRS)("encodes the pair %j / %j", (entity, passage, ids) => {
		expect(tokenizer?.encodePair(entity, passage, 512).inputIds).toEqual(ids);
	});
});
