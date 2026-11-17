import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { withMarketSupport } from "./docs";

describe("countries and languages guide", () => {
	it("matches the supported lists and what each provider declares", () => {
		const mdx = readFileSync(
			new URL("../../../docs/content/docs/user-guide/countries-and-languages.mdx", import.meta.url),
			"utf8",
		);
		expect(mdx, "run `pnpm --filter @workspace/lib docs:markets`").toBe(withMarketSupport(mdx));
	});
});
