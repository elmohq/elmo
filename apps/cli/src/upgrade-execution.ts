export type DeploymentUpgradePhase =
	| "config-migrations"
	| "checkpoint-release"
	| "cutover-lock"
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

export async function completeDeploymentUpgrade(input: {
	releaseCutoverLock: () => Promise<void>;
	stopTemporaryDependencies: () => Promise<void>;
	removeRecoveryState: () => Promise<void>;
	removeImageBackups: () => Promise<void>;
}): Promise<void> {
	await input.releaseCutoverLock();
	await input.stopTemporaryDependencies();
	await input.removeRecoveryState();
	await input.removeImageBackups();
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
	cutoverAlreadyStarted?: boolean;
	assertCanContinue?: () => void;
	runConfigMigrations: () => Promise<void>;
	checkpointRelease: () => Promise<void>;
	acquireCutoverLock: () => Promise<void>;
	runDatabaseMigration: () => Promise<void>;
	prepareRelease: () => Promise<void>;
	stopServices: () => Promise<void>;
	applyRelease: () => Promise<void>;
	startServices: () => Promise<void>;
	verifyServices: () => Promise<void>;
	rollbackRelease: (input: RollbackReleaseInput) => Promise<void>;
}): Promise<void> {
	let cutoverStarted = input.cutoverAlreadyStarted ?? false;
	try {
		input.assertCanContinue?.();
		await runPhase("config-migrations", input.runConfigMigrations);
		input.assertCanContinue?.();
		await runPhase("checkpoint-release", input.checkpointRelease);
		input.assertCanContinue?.();
		await runPhase("prepare-release", input.prepareRelease);
		input.assertCanContinue?.();
		await runPhase("cutover-lock", input.acquireCutoverLock);
		if (input.wasRunning && input.requiresMaintenance) {
			cutoverStarted = true;
			input.assertCanContinue?.();
			await runPhase("stop-services", input.stopServices);
		}
		if (input.requiresMaintenance) {
			input.assertCanContinue?.();
			await runPhase("apply-release", input.applyRelease);
		}
		input.assertCanContinue?.();
		await runPhase("database-migration", input.runDatabaseMigration);
		if (input.wasRunning && !input.requiresMaintenance) {
			cutoverStarted = true;
			input.assertCanContinue?.();
			await runPhase("stop-services", input.stopServices);
		}
		if (!input.requiresMaintenance) {
			input.assertCanContinue?.();
			await runPhase("apply-release", input.applyRelease);
		}
		if (input.wasRunning) {
			input.assertCanContinue?.();
			await runPhase("start-services", input.startServices);
			input.assertCanContinue?.();
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
