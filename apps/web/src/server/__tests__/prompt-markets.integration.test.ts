import { db } from "@workspace/lib/db/db";
import { PROMPT_GROUP_MARKET_INDEX, prompts } from "@workspace/lib/db/schema";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PromptMarketTakenError, rethrowMarketTaken } from "@/server/prompt-save";
import { createBrand, deleteBrand } from "@/test/integration/stats-fixtures";

let brandId: string;
const groupId = "6f1c3f0e-4b8a-4a53-9a51-1d2f3c4b5a60";

const insert = (market: { country: string; language: string }, enabled = true) =>
	db
		.insert(prompts)
		.values({ brandId, groupId, value: "best running shoes", enabled, ...market })
		.returning()
		.catch((error) => rethrowMarketTaken(error, PROMPT_GROUP_MARKET_INDEX));

beforeAll(async () => {
	brandId = await createBrand();
	await insert({ country: "US", language: "en" });
});

afterAll(async () => {
	await deleteBrand(brandId);
});

describe("one live prompt per market in a group", () => {
	it("takes the same question in another country or language", async () => {
		await expect(insert({ country: "GB", language: "en" })).resolves.toHaveLength(1);
		await expect(insert({ country: "US", language: "es" })).resolves.toHaveLength(1);
	});

	it("refuses a second live prompt in a market the group already has", async () => {
		await expect(insert({ country: "US", language: "en" })).rejects.toBeInstanceOf(PromptMarketTakenError);
	});

	it("keeps removed prompts out of the way", async () => {
		await expect(insert({ country: "US", language: "en" }, false)).resolves.toHaveLength(1);
	});
});
