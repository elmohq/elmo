import { describe, expect, it } from "vitest";
import {
	ALL_PROFILE_SERVICE_CONFIG_ARGS,
	applicationStartupOrder,
	assertApplicationServicesHealthy,
	assertSafeUpgradeComposeState,
	assertSafeUpgradeServiceNames,
	assertServicesQuiescent,
	composeCommandMayMutateDeployment,
	parseComposeImageReference,
	parseComposeServiceNames,
	runningApplicationServiceNames,
	runningComposeServiceNames,
} from "./compose-state.js";

describe("manual Compose recovery fence", () => {
	it("classifies commands that can alter the fenced deployment", () => {
		for (const command of [
			"attach",
			"build",
			"cp",
			"create",
			"down",
			"exec",
			"kill",
			"pause",
			"pull",
			"restart",
			"rm",
			"run",
			"scale",
			"start",
			"stop",
			"unpause",
			"up",
			"wait",
			"watch",
		]) {
			expect(composeCommandMayMutateDeployment(["--profile", "custom", command, "worker"])).toBe(true);
		}
		for (const command of ["config", "events", "images", "logs", "ls", "port", "ps", "stats", "top", "version"]) {
			expect(composeCommandMayMutateDeployment([command, "worker"])).toBe(false);
		}
		expect(composeCommandMayMutateDeployment(["future-command", "worker"])).toBe(true);
		expect(composeCommandMayMutateDeployment(["future-command", "logs"])).toBe(true);
		expect(composeCommandMayMutateDeployment(["logs", "up"])).toBe(false);
		expect(composeCommandMayMutateDeployment(["--profile", "logs", "up"])).toBe(true);
		expect(composeCommandMayMutateDeployment(["--profile=custom", "logs", "up"])).toBe(false);
		expect(composeCommandMayMutateDeployment(["--future-option", "logs"])).toBe(true);
		expect(composeCommandMayMutateDeployment(["--profile"])).toBe(true);
		expect(composeCommandMayMutateDeployment([])).toBe(false);
	});
});

describe("Compose deployment state", () => {
	it("keeps database liveness separate from stopped application services", () => {
		const running = runningComposeServiceNames([
			{ Service: "postgres", State: "running" },
			{ Service: "web", State: "exited" },
			{ Service: "worker", State: "exited" },
		]);

		expect(running).toEqual(["postgres"]);
		expect(runningApplicationServiceNames(running)).toEqual([]);
	});

	it("preserves only the application services that were running", () => {
		const running = runningComposeServiceNames([
			{ Service: "postgres", State: "running" },
			{ Service: "web", State: "exited" },
			{ Service: "worker", State: "running (healthy)" },
		]);

		expect(running).toEqual(["postgres", "worker"]);
		expect(runningApplicationServiceNames(running)).toEqual(["worker"]);
	});

	it("treats restarting applications as live so maintenance stops and restores them", () => {
		const services = [
			{ Service: "web", State: "restarting" },
			{ Service: "worker", State: "running (healthy)" },
		];

		expect(() => assertSafeUpgradeComposeState(services)).not.toThrow();
		expect(runningApplicationServiceNames(runningComposeServiceNames(services))).toEqual(["web", "worker"]);
	});

	it("fails closed for paused applications and unrelated active migrators", () => {
		expect(() => assertSafeUpgradeComposeState([{ Service: "worker", State: "paused" }])).toThrow(/stop it completely/);
		expect(() =>
			assertSafeUpgradeComposeState([{ Name: "elmo-db-migrate-1", Service: "db-migrate", State: "running" }]),
		).toThrow(/wait for it to finish/);
	});

	it("accepts created application containers only during exact-image recovery", () => {
		expect(() => assertSafeUpgradeComposeState([{ Service: "worker", State: "created" }])).toThrow(
			/stop it completely/,
		);
		expect(() =>
			assertSafeUpgradeComposeState([{ Service: "worker", State: "created" }], undefined, true),
		).not.toThrow();
	});

	it("allows only the fenced migrator belonging to an interrupted upgrade", () => {
		expect(() =>
			assertSafeUpgradeComposeState(
				[{ Name: "elmo-upgrade-db-migrate-abc", Service: "db-migrate", State: "running" }],
				"elmo-upgrade-db-migrate-abc",
			),
		).not.toThrow();
		expect(() =>
			assertSafeUpgradeComposeState(
				[
					{
						Name: "elmo-upgrade-db-migrate-abc",
						Service: "elmo-upgrade-db-migrate",
						State: "running",
					},
				],
				"elmo-upgrade-db-migrate-abc",
			),
		).not.toThrow();
	});

	it("allows only the owned cutover lock while recovering an interrupted upgrade", () => {
		const services = [
			{
				Service: "elmo-upgrade-cutover-lock",
				Name: "elmo-upgrade-cutover-lock-owned",
				State: "running",
			},
		];

		expect(() =>
			assertSafeUpgradeComposeState(services, undefined, false, "elmo-upgrade-cutover-lock-owned"),
		).not.toThrow();
		expect(() => assertSafeUpgradeComposeState(services)).toThrow(/Unrecognized live Compose service/);
	});

	it("verifies that applications cannot write after the maintenance stop", () => {
		expect(() =>
			assertServicesQuiescent(
				[
					{ Service: "web", State: "exited" },
					{ Service: "worker", State: "restarting" },
				],
				["web", "worker"],
			),
		).toThrow(/worker remained restarting/);
		expect(() =>
			assertServicesQuiescent(
				[
					{ Service: "web", State: "exited" },
					{ Service: "worker", State: "dead", ExitCode: 0 },
				],
				["web", "worker"],
			),
		).not.toThrow();
	});

	it("refuses migration after a forced or failed worker shutdown", () => {
		for (const exitCode of [1, 137, undefined]) {
			expect(() =>
				assertServicesQuiescent([{ Service: "worker", State: "exited", ExitCode: exitCode }], ["worker"]),
			).toThrow(/did not complete its graceful drain/);
		}
		expect(() => assertServicesQuiescent([], ["worker"])).toThrow(/disappeared/);
	});

	it("fails closed on live custom services whose schema compatibility is unknown", () => {
		expect(() => assertSafeUpgradeComposeState([{ Service: "scheduler", State: "running" }])).toThrow(
			/Unrecognized live Compose service scheduler/,
		);
		expect(() => assertSafeUpgradeComposeState([{ Service: "scheduler", State: "exited" }])).not.toThrow();
	});

	it("fails closed on configured custom services even when no container exists", () => {
		expect(ALL_PROFILE_SERVICE_CONFIG_ARGS).toEqual(["--profile", "*", "config", "--services"]);
		const configured = parseComposeServiceNames("postgres\nweb\nworker\nscheduler\n");
		expect(() => assertSafeUpgradeServiceNames(configured)).toThrow(/scheduler/);
		expect(() => assertSafeUpgradeServiceNames(["postgres", "db-migrate", "web", "worker"])).not.toThrow();
	});

	it("makes the worker ready before exposing the web service", () => {
		expect(applicationStartupOrder(["web", "worker"])).toEqual(["worker", "web"]);
		expect(applicationStartupOrder(["web"])).toEqual(["web"]);
	});

	it("requires explicit health from every application replica", () => {
		expect(() =>
			assertApplicationServicesHealthy([{ Service: "worker", State: "running", Health: "healthy" }], ["worker"]),
		).not.toThrow();
		expect(() => assertApplicationServicesHealthy([{ Service: "worker", State: "running" }], ["worker"])).toThrow(
			/not healthy/,
		);
		expect(() =>
			assertApplicationServicesHealthy(
				[
					{ Service: "web", State: "running", Health: "healthy" },
					{ Service: "web", State: "running", Health: "unhealthy" },
				],
				["web"],
			),
		).toThrow(/not healthy/);
	});

	it("accepts one canonical Compose image per development service", () => {
		expect(parseComposeImageReference("web", "elmo-web\n")).toBe("elmo-web");
		expect(() => parseComposeImageReference("web", "elmo-web\nelmo-db-migrate\n")).toThrow(/exactly one image/);
	});
});
