export type DeploymentUpgradePhase =
	| "config-migrations"
	| "database-migration"
	| "stop-services"
	| "apply-release"
	| "start-services";

export class DeploymentUpgradeError extends Error {
	constructor(
		public readonly phase: DeploymentUpgradePhase,
		public readonly cause: unknown,
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

/**
 * Keeps the old deployment live and its files untouched until the target
 * database migration succeeds. Image changes and restarts are cutover work.
 */
export async function executeDeploymentUpgrade(input: {
	wasRunning: boolean;
	runConfigMigrations: () => Promise<void>;
	runDatabaseMigration: () => Promise<void>;
	stopServices: () => Promise<void>;
	applyRelease: () => Promise<void>;
	startServices: () => Promise<void>;
}): Promise<void> {
	await runPhase("database-migration", input.runDatabaseMigration);
	await runPhase("config-migrations", input.runConfigMigrations);
	if (input.wasRunning) await runPhase("stop-services", input.stopServices);
	await runPhase("apply-release", input.applyRelease);
	if (input.wasRunning) await runPhase("start-services", input.startServices);
}
