import { resetDeploymentCache } from "@workspace/deployment";
import { afterEach, describe, expect, it, vi } from "vitest";
import { OPENAI_APPS_CHALLENGE_TOKEN, openaiAppsChallenge } from "../openai-apps-challenge";

afterEach(() => {
	vi.unstubAllEnvs();
	resetDeploymentCache();
});

function inMode(mode: string) {
	vi.stubEnv("DEPLOYMENT_MODE", mode);
	resetDeploymentCache();
}

describe("OpenAI domain verification", () => {
	it("answers on cloud with only the token, as plain text", async () => {
		inMode("cloud");
		const response = openaiAppsChallenge();

		expect(response.status).toBe(200);
		expect(response.headers.get("content-type")).toMatch(/^text\/plain/);
		expect(await response.text()).toBe(OPENAI_APPS_CHALLENGE_TOKEN);
	});

	it.each(["local", "demo"])("is not found on a %s deployment", (mode) => {
		inMode(mode);
		expect(openaiAppsChallenge().status).toBe(404);
	});
});
