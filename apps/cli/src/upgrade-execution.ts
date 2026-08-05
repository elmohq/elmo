export type DeploymentUpgradePhase =
	| "config-migrations"
	| "checkpoint-release"
	| "database-migration"
	| "prepare-release"
	| "stop-services"
	| "apply-release"
	| "start-services"
	| "verify-services";

export interface RollbackReleaseInput {
	restartServices: boolean;
}

export class DeploymentUpgradeError extends Error {
	constructor(
		public readonly phase: DeploymentUpgradePhase,
		public readonly cause: unknown,
		public readonly rolledBack = false,
		public readonly rollbackCause?: unknown,
	) {
		super(cause instanceof Error ? cause.message : String(cause), { cause });
		this.name = "DeploymentUpgradeError";
	}
}

async function runPhase(phase: DeploymentUpgradePhase, action: () => Promise<void>): Promise<void> {
	try {
		await action();
	} catch (error) {
		throw new DeploymentUpgradeError(phase, error);
	}
}

export async function executeDeploymentUpgrade(input: {
	wasRunning: boolean;
	requiresMaintenance: boolean;
	runConfigMigrations: () => Promise<void>;
	checkpointRelease: () => Promise<void>;
	runDatabaseMigration: () => Promise<void>;
	prepareRelease: () => Promise<void>;
	stopServices: () => Promise<void>;
	applyRelease: () => Promise<void>;
	startServices: () => Promise<void>;
	verifyServices: () => Promise<void>;
	rollbackRelease: (input: RollbackReleaseInput) => Promise<void>;
}): Promise<void> {
	let cutoverStarted = false;
	try {
		await runPhase("config-migrations", input.runConfigMigrations);
		await runPhase("checkpoint-release", input.checkpointRelease);
		await runPhase("prepare-release", input.prepareRelease);
		if (input.wasRunning && input.requiresMaintenance) {
			cutoverStarted = true;
			await runPhase("stop-services", input.stopServices);
		}
		await runPhase("database-migration", input.runDatabaseMigration);
		if (input.wasRunning && !input.requiresMaintenance) {
			cutoverStarted = true;
			await runPhase("stop-services", input.stopServices);
		}
		await runPhase("apply-release", input.applyRelease);
		if (input.wasRunning) {
			await runPhase("start-services", input.startServices);
			await runPhase("verify-services", input.verifyServices);
		}
	} catch (error) {
		if (!(error instanceof DeploymentUpgradeError)) throw error;
		try {
			await input.rollbackRelease({ restartServices: input.wasRunning && cutoverStarted });
		} catch (rollbackCause) {
			throw new DeploymentUpgradeError(error.phase, error.cause, false, rollbackCause);
		}
		throw new DeploymentUpgradeError(error.phase, error.cause, true);
	}
}
