/**
 * The per-mode flags as they ship. The `*_FEATURES` fixtures in
 * `src/test/mocks/auth.ts` are a hand-maintained copy and cannot catch a factory
 * drifting.
 */
import { resetDeploymentCache } from "@workspace/deployment";
import { beforeEach, describe, expect, it } from "vitest";
import { getDeployment } from "@/lib/config/server";

const WHITELABEL_ENV = {
	VITE_APP_NAME: "Agency",
	VITE_APP_ICON: "https://cdn.example.com/agency.png",
	VITE_APP_URL: "https://agency.example.com",
	VITE_OPTIMIZATION_URL_TEMPLATE: "https://agency.example.com/optimize/{brandId}",
};

function featuresFor(mode: string, env: Record<string, string> = {}) {
	resetDeploymentCache();
	return getDeployment({ DEPLOYMENT_MODE: mode, ...env }).features;
}

beforeEach(resetDeploymentCache);

describe("platformPicksEditable", () => {
	it("lets the viewer choose where they run or buy the deployment", () => {
		expect(featuresFor("local").platformPicksEditable).toBe(true);
		expect(featuresFor("cloud").platformPicksEditable).toBe(true);
	});

	it("denies demo, which refuses every write", () => {
		const features = featuresFor("demo");
		expect(features.readOnly).toBe(true);
		expect(features.platformPicksEditable).toBe(false);
	});

	it("denies whitelabel, where the picks and the provider bills are the agency's", () => {
		const features = featuresFor("whitelabel", WHITELABEL_ENV);
		expect(features.readOnly).toBe(false);
		expect(features.platformPicksEditable).toBe(false);
	});
});
