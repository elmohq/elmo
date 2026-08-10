import { describe, expect, it } from "vitest";
import { extractWebQueries } from "./brightdata";

describe("extractWebQueries", () => {
	it("reports the queries a run expanded the prompt into", () => {
		expect(
			extractWebQueries({
				web_search_query: ["best running shoes", "running shoe reviews"],
			}),
		).toEqual(["best running shoes", "running shoe reviews"]);
	});

	it("keeps queries on a run that reports web_search_triggered false", () => {
		// Real ChatGPT runs mostly carry `false` here while still reporting a query
		// derived from the prompt, so the flag cannot be used to discard them —
		// doing so drops the bulk of genuine fan-out data.
		expect(
			extractWebQueries({
				web_search_triggered: false,
				web_search_query: ["test 1 meaning"],
			}),
		).toEqual(["test 1 meaning"]);
	});

	it("reads ChatGPT's nested query shape", () => {
		expect(
			extractWebQueries({ metadata: { search_model_queries: { queries: ["trail shoes", "hiking boots"] } } }),
		).toEqual(["trail shoes", "hiking boots"]);
	});

	it("drops blanks and non-strings rather than recording them as searches", () => {
		expect(extractWebQueries({ web_search_query: ["ok", "", "   ", null, 7] })).toEqual(["ok"]);
	});

	it("reports nothing when the payload carries no query fields", () => {
		expect(extractWebQueries({ answer_text: "hello" })).toEqual([]);
	});
});
