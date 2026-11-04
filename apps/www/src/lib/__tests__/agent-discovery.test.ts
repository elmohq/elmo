import { describe, expect, it } from "vitest";
import { poppyManifest, protectedResourceMetadata } from "@/lib/agent-discovery";

describe("OAuth protected resource metadata", () => {
	it("names the site it is served from as the resource", () => {
		expect(protectedResourceMetadata.resource).toBe("https://www.elmohq.com");
	});

	it("sends agents to the app's issuer for tokens", () => {
		expect(protectedResourceMetadata.authorization_servers).toEqual(["https://app.elmohq.com/api/auth"]);
	});
});

describe("the Poppy manifest", () => {
	it("declares a website-only organization on the brand domain", () => {
		expect(poppyManifest).toMatchObject({
			protocol_version: "0.1",
			organization: { domain: "elmohq.com" },
			web: {},
		});
	});
});
