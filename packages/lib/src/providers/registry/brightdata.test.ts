import { describe, expect, it } from "vitest";
import { extractWebQueries } from "./brightdata";

describe("extractWebQueries", () => {
	it("reports nothing when the answer never triggered a search", () => {
		// Taken from a real BrightData response: ChatGPT answered "test 1" from
		// the model alone, and the payload still carried a query — and sources —
		// belonging to some other search entirely.
		expect(
			extractWebQueries({
				web_search_triggered: false,
				citations: [],
				web_search_query: ["OpenAI GPT-5.6 Luna"],
			}),
		).toEqual([]);
	});

	it("reports the queries when a search did run", () => {
		expect(
			extractWebQueries({
				web_search_triggered: true,
				web_search_query: ["best running shoes", "running shoe reviews"],
			}),
		).toEqual(["best running shoes", "running shoe reviews"]);
	});

	it("still reads queries from a payload that omits the flag", () => {
		// Only ChatGPT reports the trigger; the other scraped surfaces always
		// search, so an absent flag must not be read as "didn't".
		expect(extractWebQueries({ web_search_query: ["running shoes"] })).toEqual(["running shoes"]);
	});

	it("reads ChatGPT's nested query shape", () => {
		expect(
			extractWebQueries({ metadata: { search_model_queries: { queries: ["trail shoes", "hiking boots"] } } }),
		).toEqual(["trail shoes", "hiking boots"]);
	});

	it("drops blanks and non-strings rather than recording them as searches", () => {
		expect(extractWebQueries({ web_search_query: ["ok", "", "   ", null, 7] })).toEqual(["ok"]);
	});
});
