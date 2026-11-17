import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { withMarketSupport } from "./docs";

describe("markets guide", () => {
	it("matches the market lists and what each provider declares", () => {
		const mdx = readFileSync(new URL("../../../docs/content/docs/user-guide/markets.mdx", import.meta.url), "utf8");
		expect(mdx, "run `pnpm --filter @workspace/lib docs:markets`").toBe(withMarketSupport(mdx));
	});
});
