import { DEFAULT_APP_ICON, DEFAULT_APP_NAME, DEFAULT_APP_URL } from "@workspace/config/constants";
import { describe, expect, it } from "vitest";
import { createCloudDeployment } from "./deployment";

describe("createCloudDeployment", () => {
	it("reports the cloud mode", () => {
		expect(createCloudDeployment({}).mode).toBe("cloud");
	});

	it("enables self-serve signup, brand creation, and billing", () => {
		const { features } = createCloudDeployment({});
		expect(features.selfServeSignup).toBe(true);
		expect(features.canCreateBrands).toBe(true);
		expect(features.billing).toBe(true);
		expect(features.teamInvites).toBe(true);
	});

	it("disables read-only, the optimize button, and report generation", () => {
		const { features } = createCloudDeployment({});
		expect(features.readOnly).toBe(false);
		expect(features.showOptimizeButton).toBe(false);
		expect(features.reportGeneration).toBe(false);
	});

	it("uses Elmo branding defaults without VITE_APP_* overrides", () => {
		const { branding } = createCloudDeployment({
			VITE_APP_NAME: "Should Be Ignored",
			VITE_APP_ICON: "https://cdn.example.com/ignored.png",
		});
		expect(branding.name).toBe(DEFAULT_APP_NAME);
		expect(branding.icon).toBe(DEFAULT_APP_ICON);
	});

	it("reads the public app URL from APP_URL", () => {
		expect(createCloudDeployment({ APP_URL: "https://app.elmo.com/" }).branding.url).toBe("https://app.elmo.com/");
	});

	it("falls back to the default app URL when APP_URL is absent (env validation reports it)", () => {
		expect(createCloudDeployment({}).branding.url).toBe(DEFAULT_APP_URL);
	});
});
