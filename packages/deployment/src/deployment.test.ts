import { DEFAULT_APP_ICON, DEFAULT_APP_NAME, DEFAULT_APP_URL, DEFAULT_CHART_COLORS } from "@workspace/config/constants";
import type { Deployment } from "@workspace/config/types";
import { beforeEach, describe, expect, it } from "vitest";
import { buildDeployment, getDeployment, resetDeploymentCache } from "./deployment";

const WHITELABEL_ENV = {
	VITE_APP_NAME: "Agency",
	VITE_APP_ICON: "https://cdn.example.com/agency.png",
	VITE_APP_URL: "https://agency.example.com",
	VITE_OPTIMIZATION_URL_TEMPLATE: "https://agency.example.com/optimize/{brandId}",
};

/** The whole configuration surface, mode by mode, so no value drifts unnoticed. */
const EXPECTED: Record<string, Deployment> = {
	local: {
		mode: "local",
		features: {
			readOnly: false,
			showOptimizeButton: false,
			canCreateBrands: true,
			platformPicksEditable: true,
			canEditOrganizations: true,
			canCreateOrganizations: false,
			selfServeSignup: false,
			billing: false,
			reportGeneration: true,
			teamInvites: false,
		},
		branding: {
			name: DEFAULT_APP_NAME,
			icon: DEFAULT_APP_ICON,
			url: DEFAULT_APP_URL,
			parentName: undefined,
			parentUrl: undefined,
			chartColors: DEFAULT_CHART_COLORS,
		},
	},
	demo: {
		mode: "demo",
		features: {
			readOnly: true,
			showOptimizeButton: false,
			canCreateBrands: false,
			platformPicksEditable: false,
			canEditOrganizations: false,
			canCreateOrganizations: false,
			selfServeSignup: false,
			billing: false,
			reportGeneration: true,
			teamInvites: false,
		},
		branding: {
			name: DEFAULT_APP_NAME,
			icon: DEFAULT_APP_ICON,
			url: DEFAULT_APP_URL,
			parentName: undefined,
			parentUrl: undefined,
			chartColors: DEFAULT_CHART_COLORS,
		},
	},
	whitelabel: {
		mode: "whitelabel",
		features: {
			readOnly: false,
			showOptimizeButton: true,
			canCreateBrands: false,
			platformPicksEditable: false,
			canEditOrganizations: false,
			canCreateOrganizations: false,
			selfServeSignup: false,
			billing: false,
			reportGeneration: true,
			teamInvites: false,
		},
		branding: {
			name: "Agency",
			icon: "https://cdn.example.com/agency.png",
			url: "https://agency.example.com",
			parentName: undefined,
			parentUrl: undefined,
			onboardingRedirectUrl: undefined,
			onboardingRedirectUrlTemplate: undefined,
			optimizationUrlTemplate: "https://agency.example.com/optimize/{brandId}",
			chartColors: DEFAULT_CHART_COLORS,
		},
	},
	cloud: {
		mode: "cloud",
		features: {
			readOnly: false,
			showOptimizeButton: false,
			canCreateBrands: true,
			platformPicksEditable: true,
			canEditOrganizations: true,
			canCreateOrganizations: true,
			selfServeSignup: true,
			billing: true,
			reportGeneration: false,
			teamInvites: true,
		},
		branding: {
			name: DEFAULT_APP_NAME,
			icon: DEFAULT_APP_ICON,
			url: DEFAULT_APP_URL,
			chartColors: DEFAULT_CHART_COLORS,
		},
	},
};

describe("buildDeployment", () => {
	it.each(["local", "demo", "cloud"] as const)("builds %s from a bare environment", (mode) => {
		expect(buildDeployment(mode, {})).toEqual(EXPECTED[mode]);
	});

	it("builds whitelabel from its required VITE_APP_* vars", () => {
		expect(buildDeployment("whitelabel", WHITELABEL_ENV)).toEqual(EXPECTED.whitelabel);
	});

	it("refuses whitelabel without its required branding vars", () => {
		expect(() => buildDeployment("whitelabel", {})).toThrow();
	});
});

describe("branding", () => {
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
