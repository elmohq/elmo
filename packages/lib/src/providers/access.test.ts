import { describe, expect, it } from "vitest";
import { API_PROVIDER_IDS } from "./access";
import { getAllProviders } from "./index";

describe("API provider ids", () => {
	it("lists exactly the registered providers that call a model's API", () => {
		const registered = getAllProviders()
			.filter((provider) => provider.access === "api")
			.map((provider) => provider.id)
			.sort();
		expect([...API_PROVIDER_IDS].sort()).toEqual(registered);
	});
});
