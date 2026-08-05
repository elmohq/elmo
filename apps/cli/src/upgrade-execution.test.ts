import { describe, expect, it, vi } from "vitest";
import { executeDeploymentUpgrade } from "./upgrade-execution";

function action(name: string, calls: string[], failure?: Error) {
	return vi.fn(async () => {
		calls.push(name);
		if (failure) throw failure;
	});
}

describe("deployment upgrade cutover", () => {
	it("migrates before stopping, repinning, or restarting a running deployment", async () => {
		const calls: string[] = [];
		await executeDeploymentUpgrade({
			wasRunning: true,
			runConfigMigrations: action("config", calls),
			runDatabaseMigration: action("database", calls),
			stopServices: action("stop", calls),
			applyRelease: action("repin", calls),
			startServices: action("restart", calls),
		});

		expect(calls).toEqual(["database", "config", "stop", "repin", "restart"]);
	});

	it("leaves old services and image pins untouched when database migration fails", async () => {
		const calls: string[] = [];
		const failure = new Error("database rejected migration");
		const upgrade = executeDeploymentUpgrade({
			wasRunning: true,
			runConfigMigrations: action("config", calls),
			runDatabaseMigration: action("database", calls, failure),
			stopServices: action("stop", calls),
			applyRelease: action("repin", calls),
			startServices: action("restart", calls),
		});

		await expect(upgrade).rejects.toMatchObject({
			phase: "database-migration",
			cause: failure,
		});
		expect(calls).toEqual(["database"]);
	});

	it("preserves existing config migration failure behavior", async () => {
		const calls: string[] = [];
		const upgrade = executeDeploymentUpgrade({
			wasRunning: true,
			runConfigMigrations: action("config", calls, new Error("invalid config")),
			runDatabaseMigration: action("database", calls),
			stopServices: action("stop", calls),
			applyRelease: action("repin", calls),
			startServices: action("restart", calls),
		});

		await expect(upgrade).rejects.toMatchObject({ phase: "config-migrations" });
		expect(calls).toEqual(["database", "config"]);
	});
});
