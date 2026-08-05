import { getDeployment, resetDeploymentCache } from "@workspace/deployment";
import { afterEach, describe, expect, it } from "vitest";
import { isOpportunitiesAvailable, requireOpportunitiesAvailable } from "../opportunities-availability";

const WHITELABEL_ENV = {
	VITE_APP_NAME: "Partner app",
	VITE_APP_ICON: "/icon.svg",
	VITE_APP_URL: "https://partner.example",
	VITE_OPTIMIZATION_URL_TEMPLATE: "https://partner.example/optimize/{prompt}",
};

describe("opportunities deployment availability", () => {
	afterEach(resetDeploymentCache);

	it.each([
		["local", true],
		["demo", true],
		["whitelabel", true],
		["cloud", false],
	] as const)("configures the %s deployment as %s", (mode, expected) => {
		const deployment = getDeployment({
			env: {
				...WHITELABEL_ENV,
				DEPLOYMENT_MODE: mode,
			},
		});

		expect(deployment.features.opportunities).toBe(expected);
		expect(isOpportunitiesAvailable(deployment.features)).toBe(expected);
	});

	it("fails closed when deployment features are unavailable or disabled", () => {
		expect(isOpportunitiesAvailable(undefined)).toBe(false);
		expect(() => requireOpportunitiesAvailable(undefined)).toThrow(
			"Opportunities are not available in this deployment",
		);
		expect(() => requireOpportunitiesAvailable({ opportunities: false })).toThrow(
			"Opportunities are not available in this deployment",
		);
	});
});
