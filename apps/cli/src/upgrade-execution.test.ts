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
			requiresMaintenance: false,
			runConfigMigrations: action("config", calls),
			checkpointRelease: action("checkpoint", calls),
			runDatabaseMigration: action("database", calls),
			prepareRelease: action("prepare", calls),
			stopServices: action("stop", calls),
			applyRelease: action("repin", calls),
			startServices: action("restart", calls),
			verifyServices: action("verify", calls),
			rollbackRelease: vi.fn(async ({ restartServices }) => {
				calls.push(`rollback:${restartServices}`);
			}),
		});

		expect(calls).toEqual(["config", "checkpoint", "prepare", "database", "stop", "repin", "restart", "verify"]);
	});

	it("leaves old services and image pins untouched when database migration fails", async () => {
		const calls: string[] = [];
		const failure = new Error("database rejected migration");
		const upgrade = executeDeploymentUpgrade({
			wasRunning: true,
			requiresMaintenance: false,
			runConfigMigrations: action("config", calls),
			checkpointRelease: action("checkpoint", calls),
			runDatabaseMigration: action("database", calls, failure),
			prepareRelease: action("prepare", calls),
			stopServices: action("stop", calls),
			applyRelease: action("repin", calls),
			startServices: action("restart", calls),
			verifyServices: action("verify", calls),
			rollbackRelease: vi.fn(async ({ restartServices }) => {
				calls.push(`rollback:${restartServices}`);
			}),
		});

		await expect(upgrade).rejects.toMatchObject({
			phase: "database-migration",
			cause: failure,
		});
		expect(calls).toEqual(["config", "checkpoint", "prepare", "database", "rollback:false"]);
	});

	it("restores config without restarting services when preparation fails", async () => {
		const calls: string[] = [];
		const failure = new Error("target image unavailable");
		const upgrade = executeDeploymentUpgrade({
			wasRunning: true,
			requiresMaintenance: false,
			runConfigMigrations: action("config", calls),
			checkpointRelease: action("checkpoint", calls),
			runDatabaseMigration: action("database", calls),
			prepareRelease: action("prepare", calls, failure),
			stopServices: action("stop", calls),
			applyRelease: action("repin", calls),
			startServices: action("restart", calls),
			verifyServices: action("verify", calls),
			rollbackRelease: vi.fn(async ({ restartServices }) => {
				calls.push(`rollback:${restartServices}`);
			}),
		});

		await expect(upgrade).rejects.toMatchObject({ phase: "prepare-release", cause: failure, rolledBack: true });
		expect(calls).toEqual(["config", "checkpoint", "prepare", "rollback:false"]);
	});

	it("restores and restarts the old release when target health verification fails", async () => {
		const calls: string[] = [];
		const failure = new Error("target unhealthy");
		const upgrade = executeDeploymentUpgrade({
			wasRunning: true,
			requiresMaintenance: false,
			runConfigMigrations: action("config", calls),
			checkpointRelease: action("checkpoint", calls),
			runDatabaseMigration: action("database", calls),
			prepareRelease: action("prepare", calls),
			stopServices: action("stop", calls),
			applyRelease: action("repin", calls),
			startServices: action("restart", calls),
			verifyServices: action("verify", calls, failure),
			rollbackRelease: vi.fn(async ({ restartServices }) => {
				calls.push(`rollback:${restartServices}`);
			}),
		});

		await expect(upgrade).rejects.toMatchObject({ phase: "verify-services", cause: failure, rolledBack: true });
		expect(calls).toEqual([
			"config",
			"checkpoint",
			"prepare",
			"database",
			"stop",
			"repin",
			"restart",
			"verify",
			"rollback:true",
		]);
	});

	it("reports both the cutover and rollback failures", async () => {
		const calls: string[] = [];
		const failure = new Error("target start failed");
		const rollbackFailure = new Error("old release failed to restart");
		const upgrade = executeDeploymentUpgrade({
			wasRunning: true,
			requiresMaintenance: false,
			runConfigMigrations: action("config", calls),
			checkpointRelease: action("checkpoint", calls),
			runDatabaseMigration: action("database", calls),
			prepareRelease: action("prepare", calls),
			stopServices: action("stop", calls),
			applyRelease: action("repin", calls),
			startServices: action("restart", calls, failure),
			verifyServices: action("verify", calls),
			rollbackRelease: action("rollback", calls, rollbackFailure),
		});

		await expect(upgrade).rejects.toMatchObject({
			phase: "start-services",
			cause: failure,
			rolledBack: false,
			rollbackCause: rollbackFailure,
		});
	});

	it("prepares and applies a stopped deployment without starting it", async () => {
		const calls: string[] = [];
		await executeDeploymentUpgrade({
			wasRunning: false,
			requiresMaintenance: false,
			runConfigMigrations: action("config", calls),
			checkpointRelease: action("checkpoint", calls),
			runDatabaseMigration: action("database", calls),
			prepareRelease: action("prepare", calls),
			stopServices: action("stop", calls),
			applyRelease: action("repin", calls),
			startServices: action("restart", calls),
			verifyServices: action("verify", calls),
			rollbackRelease: action("rollback", calls),
		});

		expect(calls).toEqual(["config", "checkpoint", "prepare", "database", "repin"]);
	});

	it("stops membership writers before a maintenance database migration", async () => {
		const calls: string[] = [];
		await executeDeploymentUpgrade({
			wasRunning: true,
			requiresMaintenance: true,
			runConfigMigrations: action("config", calls),
			checkpointRelease: action("checkpoint", calls),
			runDatabaseMigration: action("database", calls),
			prepareRelease: action("prepare", calls),
			stopServices: action("stop", calls),
			applyRelease: action("repin", calls),
			startServices: action("restart", calls),
			verifyServices: action("verify", calls),
			rollbackRelease: action("rollback", calls),
		});

		expect(calls).toEqual(["config", "checkpoint", "prepare", "stop", "database", "repin", "restart", "verify"]);
	});

	it("restarts the old release when a maintenance database migration rolls back", async () => {
		const calls: string[] = [];
		const failure = new Error("migration lock timeout");
		const upgrade = executeDeploymentUpgrade({
			wasRunning: true,
			requiresMaintenance: true,
			runConfigMigrations: action("config", calls),
			checkpointRelease: action("checkpoint", calls),
			runDatabaseMigration: action("database", calls, failure),
			prepareRelease: action("prepare", calls),
			stopServices: action("stop", calls),
			applyRelease: action("repin", calls),
			startServices: action("restart", calls),
			verifyServices: action("verify", calls),
			rollbackRelease: vi.fn(async ({ restartServices }) => {
				calls.push(`rollback:${restartServices}`);
			}),
		});

		await expect(upgrade).rejects.toMatchObject({ phase: "database-migration", rolledBack: true });
		expect(calls).toEqual(["config", "checkpoint", "prepare", "stop", "database", "rollback:true"]);
	});
});
