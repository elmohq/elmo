import { describe, expect, it } from "vitest";
import {
	applicationStartupOrder,
	runningApplicationServiceNames,
	runningComposeServiceNames,
} from "./compose-state.js";

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

	it("makes the worker ready before exposing the web service", () => {
		expect(applicationStartupOrder(["web", "worker"])).toEqual(["worker", "web"]);
		expect(applicationStartupOrder(["web"])).toEqual(["web"]);
	});
});
