import { describe, expect, it } from "vitest";
import { buildComposeYaml } from "./compose.js";

function workerService(yaml: string): string {
	const start = yaml.indexOf("\n  worker:\n");
	const rest = yaml.slice(start + 1);
	const next = rest.slice(1).search(/\n {2}\S/);
	return next === -1 ? rest : rest.slice(0, next + 1);
}

describe("buildComposeYaml", () => {
	it.each([
		["docker", false],
		["external", false],
		["docker", true],
	] as const)("restarts the worker after it exits (postgres %s, dev %s)", (postgresMode, dev) => {
		const yaml = buildComposeYaml({ dev, postgresMode, repoRoot: "/repo", port: 3000, version: "1.0.0" });
		expect(workerService(yaml)).toContain("restart: unless-stopped");
	});
});
