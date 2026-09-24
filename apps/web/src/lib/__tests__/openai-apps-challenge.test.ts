import { describe, expect, it } from "vitest";
import { openaiAppsChallenge } from "../openai-apps-challenge";

describe("OpenAI domain verification", () => {
	it("answers with only the token, as plain text", async () => {
		const response = openaiAppsChallenge("  abc123\n");

		expect(response.status).toBe(200);
		expect(response.headers.get("content-type")).toMatch(/^text\/plain/);
		expect(await response.text()).toBe("abc123");
	});

	it("is not found on a deployment that has no token", () => {
		expect(openaiAppsChallenge(undefined).status).toBe(404);
		expect(openaiAppsChallenge("  ").status).toBe(404);
	});
});
