import semver from "semver";
import { describe, expect, it } from "vitest";
import {
	crossesCloudSchemaBoundary,
	legacySingleDeploymentCutoverAllowed,
	RELEASE_COMPATIBILITY_BOUNDARIES,
	requiresMaintenanceUpgrade,
} from "./upgrade-policy.js";

describe("upgrade maintenance policy", () => {
	it("uses maintenance when a legacy config has no rendered version", () => {
		expect(requiresMaintenanceUpgrade({ detectedVersion: null, targetVersion: "0.2.18", plan: [] })).toBe(true);
	});

	it("uses maintenance when an upgrade crosses the cloud schema boundary", () => {
		expect(requiresMaintenanceUpgrade({ detectedVersion: "0.2.17", targetVersion: "0.2.18", plan: [] })).toBe(true);
		expect(requiresMaintenanceUpgrade({ detectedVersion: "0.2.17", targetVersion: "0.2.18-rc.1", plan: [] })).toBe(
			true,
		);
		expect(requiresMaintenanceUpgrade({ detectedVersion: "0.2.17", targetVersion: "0.3.0", plan: [] })).toBe(true);
	});

	it("uses maintenance when any planned config migration requires it", () => {
		expect(
			requiresMaintenanceUpgrade({
				detectedVersion: "0.2.18",
				targetVersion: "0.2.19",
				plan: [{ requiresMaintenance: false }, { requiresMaintenance: true }],
			}),
		).toBe(true);
	});

	it("keeps later compatible upgrades online until their cutover", () => {
		expect(
			requiresMaintenanceUpgrade({
				detectedVersion: "0.2.18",
				targetVersion: "0.2.19",
				plan: [{ requiresMaintenance: false }],
			}),
		).toBe(false);
	});

	it("declares valid release versions for every database compatibility boundary", () => {
		for (const boundary of RELEASE_COMPATIBILITY_BOUNDARIES) {
			expect(semver.valid(boundary.targetVersion)).not.toBeNull();
		}
	});

	it("requires explicit rollback compatibility only across the cloud schema boundary", () => {
		expect(crossesCloudSchemaBoundary({ detectedVersion: "0.2.17", targetVersion: "0.2.18" })).toBe(true);
		expect(crossesCloudSchemaBoundary({ detectedVersion: "0.2.17", targetVersion: "0.2.18-rc.1" })).toBe(true);
		expect(crossesCloudSchemaBoundary({ detectedVersion: null, targetVersion: "0.2.18" })).toBe(true);
		expect(crossesCloudSchemaBoundary({ detectedVersion: "0.2.18", targetVersion: "0.2.19" })).toBe(false);
	});

	it("requires a dedicated acknowledgment for a legacy local external database", () => {
		const base = {
			crossesSchemaBoundary: true,
			deploymentMode: "local",
			managedLocalDeployment: false,
			runtimeFenceParticipates: false,
		};
		expect(() => legacySingleDeploymentCutoverAllowed({ ...base, singleDeploymentAcknowledged: false })).toThrow(
			/--yes does not imply/,
		);
		expect(legacySingleDeploymentCutoverAllowed({ ...base, singleDeploymentAcknowledged: true })).toBe(true);
	});

	it("never lets the local-only acknowledgment bypass white-label fencing", () => {
		expect(() =>
			legacySingleDeploymentCutoverAllowed({
				crossesSchemaBoundary: true,
				deploymentMode: "whitelabel",
				managedLocalDeployment: false,
				runtimeFenceParticipates: false,
				singleDeploymentAcknowledged: true,
			}),
		).toThrow(/staged compatibility/);
	});
});
