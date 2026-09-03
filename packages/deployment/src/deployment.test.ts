import { DEFAULT_APP_ICON, DEFAULT_APP_NAME, DEFAULT_APP_URL, DEFAULT_CHART_COLORS } from "@workspace/config/constants";
import { beforeEach, describe, expect, it } from "vitest";
import { buildDeployment, getDeployment, resetDeploymentCache } from "./deployment";

const WHITELABEL_ENV = {
	VITE_APP_NAME: "Agency",
	VITE_APP_ICON: "https://cdn.example.com/agency.png",
	VITE_APP_URL: "https://agency.example.com",
	VITE_OPTIMIZATION_URL_TEMPLATE: "https://agency.example.com/optimize/{brandId}",
};

describe("branding", () => {
	it("falls back to the Elmo defaults when nothing is configured", () => {
		expect(buildDeployment("local", {}).branding).toEqual({
			name: DEFAULT_APP_NAME,
			icon: DEFAULT_APP_ICON,
			url: DEFAULT_APP_URL,
			parentName: undefined,
			parentUrl: undefined,
			chartColors: DEFAULT_CHART_COLORS,
		});
	});

	it("takes whitelabel's name, icon and URL from its required VITE_APP_* vars", () => {
		expect(buildDeployment("whitelabel", WHITELABEL_ENV).branding).toMatchObject({
			name: "Agency",
			icon: "https://cdn.example.com/agency.png",
			url: "https://agency.example.com",
			optimizationUrlTemplate: "https://agency.example.com/optimize/{brandId}",
		});
	});

	it("refuses whitelabel without those vars", () => {
		expect(() => buildDeployment("whitelabel", {})).toThrow();
	});

	it("takes local's name, icon, URL and parent links from the environment", () => {
		const { branding } = buildDeployment("local", {
			APP_NAME: "Acme",
			APP_ICON: "https://cdn.example.com/acme.png",
			APP_URL: "https://acme.example.com",
			APP_PARENT_NAME: "Acme Group",
			APP_PARENT_URL: "https://group.example.com",
		});
		expect(branding).toMatchObject({
			name: "Acme",
			icon: "https://cdn.example.com/acme.png",
			url: "https://acme.example.com",
			parentName: "Acme Group",
			parentUrl: "https://group.example.com",
		});
	});

	it("ignores VITE_APP_* overrides in cloud, which ships the Elmo defaults", () => {
		const { branding } = buildDeployment("cloud", {
			VITE_APP_NAME: "Should Be Ignored",
			VITE_APP_ICON: "https://cdn.example.com/ignored.png",
			APP_URL: "https://app.elmo.com/",
		});
		expect(branding.name).toBe(DEFAULT_APP_NAME);
		expect(branding.icon).toBe(DEFAULT_APP_ICON);
		expect(branding.url).toBe("https://app.elmo.com/");
	});

	it("expands the whitelabel onboarding redirect template per brand", () => {
		const { branding } = buildDeployment("whitelabel", {
			...WHITELABEL_ENV,
			VITE_ONBOARDING_REDIRECT_URL_TEMPLATE: "https://agency.example.com/setup/{brandId}",
		});
		expect(branding.onboardingRedirectUrl?.("brand_1")).toBe("https://agency.example.com/setup/brand_1");
	});

	it("splits VITE_CHART_COLORS, falling back to the defaults when it is blank", () => {
		expect(
			buildDeployment("whitelabel", { ...WHITELABEL_ENV, VITE_CHART_COLORS: "#111, #222 ,#333" }).branding.chartColors,
		).toEqual(["#111", "#222", "#333"]);
		expect(buildDeployment("whitelabel", { ...WHITELABEL_ENV, VITE_CHART_COLORS: " , " }).branding.chartColors).toEqual(
			DEFAULT_CHART_COLORS,
		);
	});
});

describe("getDeployment", () => {
	beforeEach(resetDeploymentCache);

	it("resolves the mode from DEPLOYMENT_MODE", () => {
		expect(getDeployment({ env: { DEPLOYMENT_MODE: "cloud" } }).mode).toBe("cloud");
	});

	it("turns a read-only local install into demo mode", () => {
		const deployment = getDeployment({ env: { DEPLOYMENT_MODE: "local", READ_ONLY: "true" } });
		expect(deployment.mode).toBe("demo");
		expect(deployment.features.readOnly).toBe(true);
	});

	it("caches the first resolution, so later env changes are ignored", () => {
		const first = getDeployment({ env: { DEPLOYMENT_MODE: "cloud" } });
		expect(getDeployment({ env: { DEPLOYMENT_MODE: "local" } })).toBe(first);
		resetDeploymentCache();
		expect(getDeployment({ env: { DEPLOYMENT_MODE: "local" } }).mode).toBe("local");
	});
});
