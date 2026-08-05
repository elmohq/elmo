import { describe, expect, it, vi } from "vitest";
import { completeDeploymentUpgrade, executeDeploymentUpgrade } from "./upgrade-execution";

function action(name: string, calls: string[], failure?: Error) {
	return vi.fn(async () => {
		calls.push(name);
		if (failure) throw failure;
	});
}

describe("deployment upgrade cutover", () => {
	it("does not erase recovery until the database cutover lock releases cleanly", async () => {
		const calls: string[] = [];
		await completeDeploymentUpgrade({
			releaseCutoverLock: action("release-lock", calls),
			stopTemporaryDependencies: action("stop-dependencies", calls),
			removeRecoveryState: action("remove-recovery", calls),
			removeImageBackups: action("remove-backups", calls),
		});
		expect(calls).toEqual(["release-lock", "stop-dependencies", "remove-recovery", "remove-backups"]);

		calls.length = 0;
		await expect(
			completeDeploymentUpgrade({
				releaseCutoverLock: action("release-lock", calls, new Error("lock did not exit cleanly")),
				stopTemporaryDependencies: action("stop-dependencies", calls),
				removeRecoveryState: action("remove-recovery", calls),
				removeImageBackups: action("remove-backups", calls),
			}),
		).rejects.toThrow(/lock did not exit cleanly/);
		expect(calls).toEqual(["release-lock"]);
	});

	it("migrates before stopping, repinning, or restarting a running deployment", async () => {
		const calls: string[] = [];
		await executeDeploymentUpgrade({
			wasRunning: true,
			requiresMaintenance: false,
			runConfigMigrations: action("config", calls),
			checkpointRelease: action("checkpoint", calls),
			acquireCutoverLock: action("lock", calls),
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

		expect(calls).toEqual([
			"config",
			"checkpoint",
			"prepare",
			"lock",
			"database",
			"stop",
			"repin",
			"restart",
			"verify",
		]);
	});

	it("leaves old services and image pins untouched when database migration fails", async () => {
		const calls: string[] = [];
		const failure = new Error("database rejected migration");
		const upgrade = executeDeploymentUpgrade({
			wasRunning: true,
			requiresMaintenance: false,
			runConfigMigrations: action("config", calls),
			checkpointRelease: action("checkpoint", calls),
			acquireCutoverLock: action("lock", calls),
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
		expect(calls).toEqual(["config", "checkpoint", "prepare", "lock", "database", "rollback:false"]);
	});

	it("does not mutate the deployment when another upgrade owns the database lock", async () => {
		const calls: string[] = [];
		const lockFailure = new Error("another upgrade owns the database lock");
		const upgrade = executeDeploymentUpgrade({
			wasRunning: true,
			requiresMaintenance: true,
			runConfigMigrations: action("config", calls),
			checkpointRelease: action("checkpoint", calls),
			prepareRelease: action("prepare", calls),
			acquireCutoverLock: action("lock", calls, lockFailure),
			runDatabaseMigration: action("database", calls),
			stopServices: action("stop", calls),
			applyRelease: action("repin", calls),
			startServices: action("restart", calls),
			verifyServices: action("verify", calls),
			rollbackRelease: vi.fn(async ({ restartServices }) => {
				calls.push(`rollback:${restartServices}`);
			}),
		});

		await expect(upgrade).rejects.toMatchObject({ phase: "cutover-lock", cause: lockFailure });
		expect(calls).toEqual(["config", "checkpoint", "prepare", "lock", "rollback:false"]);
	});

	it("restores config without restarting services when preparation fails", async () => {
		const calls: string[] = [];
		const failure = new Error("target image unavailable");
		const upgrade = executeDeploymentUpgrade({
			wasRunning: true,
			requiresMaintenance: false,
			runConfigMigrations: action("config", calls),
			checkpointRelease: action("checkpoint", calls),
			acquireCutoverLock: action("lock", calls),
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

	it("restarts the prior release when resumed cutover preparation fails", async () => {
		const calls: string[] = [];
		const failure = new Error("target image unavailable during replay");
		const upgrade = executeDeploymentUpgrade({
			wasRunning: true,
			requiresMaintenance: true,
			cutoverAlreadyStarted: true,
			runConfigMigrations: action("config", calls),
			checkpointRelease: action("checkpoint", calls),
			acquireCutoverLock: action("lock", calls),
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

		await expect(upgrade).rejects.toMatchObject({ phase: "prepare-release", rolledBack: true });
		expect(calls).toEqual(["config", "checkpoint", "prepare", "rollback:true"]);
	});

	it("restores and restarts the old release when target health verification fails", async () => {
		const calls: string[] = [];
		const failure = new Error("target unhealthy");
		const upgrade = executeDeploymentUpgrade({
			wasRunning: true,
			requiresMaintenance: false,
			runConfigMigrations: action("config", calls),
			checkpointRelease: action("checkpoint", calls),
			acquireCutoverLock: action("lock", calls),
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
			"lock",
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
			acquireCutoverLock: action("lock", calls),
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
			acquireCutoverLock: action("lock", calls),
			runDatabaseMigration: action("database", calls),
			prepareRelease: action("prepare", calls),
			stopServices: action("stop", calls),
			applyRelease: action("repin", calls),
			startServices: action("restart", calls),
			verifyServices: action("verify", calls),
			rollbackRelease: action("rollback", calls),
		});

		expect(calls).toEqual(["config", "checkpoint", "prepare", "lock", "database", "repin"]);
	});

	it("stops membership writers before a maintenance database migration", async () => {
		const calls: string[] = [];
		await executeDeploymentUpgrade({
			wasRunning: true,
			requiresMaintenance: true,
			runConfigMigrations: action("config", calls),
			checkpointRelease: action("checkpoint", calls),
			acquireCutoverLock: action("lock", calls),
			runDatabaseMigration: action("database", calls),
			prepareRelease: action("prepare", calls),
			stopServices: action("stop", calls),
			applyRelease: action("repin", calls),
			startServices: action("restart", calls),
			verifyServices: action("verify", calls),
			rollbackRelease: action("rollback", calls),
		});

		expect(calls).toEqual([
			"config",
			"checkpoint",
			"prepare",
			"lock",
			"stop",
			"repin",
			"database",
			"restart",
			"verify",
		]);
	});

	it("restarts the old release when a maintenance database migration rolls back", async () => {
		const calls: string[] = [];
		const failure = new Error("migration lock timeout");
		const upgrade = executeDeploymentUpgrade({
			wasRunning: true,
			requiresMaintenance: true,
			runConfigMigrations: action("config", calls),
			checkpointRelease: action("checkpoint", calls),
			acquireCutoverLock: action("lock", calls),
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
		expect(calls).toEqual(["config", "checkpoint", "prepare", "lock", "stop", "repin", "database", "rollback:true"]);
	});

	it("pins the target before migrating a stopped deployment across a maintenance boundary", async () => {
		const calls: string[] = [];
		await executeDeploymentUpgrade({
			wasRunning: false,
			requiresMaintenance: true,
			runConfigMigrations: action("config", calls),
			checkpointRelease: action("checkpoint", calls),
			acquireCutoverLock: action("lock", calls),
			runDatabaseMigration: action("database", calls),
			prepareRelease: action("prepare", calls),
			stopServices: action("stop", calls),
			applyRelease: action("repin", calls),
			startServices: action("restart", calls),
			verifyServices: action("verify", calls),
			rollbackRelease: action("rollback", calls),
		});

		expect(calls).toEqual(["config", "checkpoint", "prepare", "lock", "repin", "database"]);
	});
});
