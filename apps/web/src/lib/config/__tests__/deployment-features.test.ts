/** Checks the real deployment factories. The `*_FEATURES` test fixtures are a
 *  hand-written copy, so asserting against those would not catch a drift. */
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

describe("canEditOrganizations", () => {
	it("is the deployment's own record only where it owns it", () => {
		expect(featuresFor("local").canEditOrganizations).toBe(true);
		expect(featuresFor("cloud").canEditOrganizations).toBe(true);
	});

	it("is refused where another system owns the record, or nothing is written", () => {
		expect(featuresFor("demo").canEditOrganizations).toBe(false);
		expect(featuresFor("whitelabel", WHITELABEL_ENV).canEditOrganizations).toBe(false);
	});
});

describe("canCreateOrganizations", () => {
	it("is cloud's alone — it is the only mode where a user signs up for another", () => {
		expect(featuresFor("cloud").canCreateOrganizations).toBe(true);
	});

	it("denies the modes whose organizations come from somewhere else", () => {
		expect(featuresFor("local").canCreateOrganizations).toBe(false);
		expect(featuresFor("demo").canCreateOrganizations).toBe(false);
		expect(featuresFor("whitelabel", WHITELABEL_ENV).canCreateOrganizations).toBe(false);
	});
});

describe("teamInvites", () => {
	it("is cloud's alone — it is the only mode that owns its own roster", () => {
		expect(featuresFor("cloud").teamInvites).toBe(true);
	});

	it("denies the modes whose memberships come from somewhere else, or are one user", () => {
		expect(featuresFor("local").teamInvites).toBe(false);
		expect(featuresFor("demo").teamInvites).toBe(false);
		expect(featuresFor("whitelabel", WHITELABEL_ENV).teamInvites).toBe(false);
	});
});
