import { describe, expect, it } from "vitest";
import { poppyManifest } from "@/lib/agent-discovery";

describe("the Poppy manifest", () => {
	it("declares a website-only organization on the brand domain", () => {
		expect(poppyManifest).toMatchObject({
			protocol_version: "0.1",
			organization: { domain: "elmohq.com" },
			web: {},
		});
	});
});
