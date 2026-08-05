export interface ComposeServiceState {
	ExitCode?: number;
	Health?: string;
	Name?: string;
	Service: string;
	State: string;
}

export function assertApplicationServicesHealthy(
	services: readonly ComposeServiceState[],
	requiredServices: readonly string[],
): void {
	for (const required of requiredServices) {
		const matching = services.filter((service) => service.Service === required);
		if (
			matching.length === 0 ||
			matching.some(
				(service) => !isLiveState(normalizedState(service)) || service.Health?.trim().toLowerCase() !== "healthy",
			)
		) {
			throw new Error(`Required service ${required} is not healthy`);
		}
	}
}

function normalizedState(service: ComposeServiceState): string {
	return service.State.trim().toLowerCase();
}

function isLiveState(state: string): boolean {
	return state.startsWith("running") || state.startsWith("restarting");
}

function isTerminalState(state: string): boolean {
	return state.startsWith("exited") || state.startsWith("dead");
}

export function parseComposeImageReference(service: string, output: string): string {
	const references = [
		...new Set(
			output
				.split("\n")
				.map((line) => line.trim())
				.filter(Boolean),
		),
	];
	if (references.length !== 1) {
		throw new Error(`Compose service ${service} did not resolve to exactly one image`);
	}
	return references[0] as string;
}

export function assertSafeUpgradeComposeState(
	services: readonly ComposeServiceState[],
	allowedRecoveryMigratorName?: string,
	allowPreparedApplicationContainers = false,
	allowedRecoveryCutoverLockName?: string | readonly string[],
): void {
	const allowedCutoverLocks = new Set(
		typeof allowedRecoveryCutoverLockName === "string"
			? [allowedRecoveryCutoverLockName]
			: (allowedRecoveryCutoverLockName ?? []),
	);
	for (const service of services) {
		if (allowedRecoveryMigratorName && service.Name === allowedRecoveryMigratorName) continue;
		if (service.Name && allowedCutoverLocks.has(service.Name)) continue;
		const state = normalizedState(service);
		if (service.Service === "web" || service.Service === "worker") {
			const isPreparedContainer = allowPreparedApplicationContainers && state.startsWith("created");
			if (!isLiveState(state) && !isTerminalState(state) && !isPreparedContainer) {
				throw new Error(
					`Cannot safely upgrade while ${service.Service} is ${service.State}; stop it completely and retry`,
				);
			}
		}
		if (
			service.Service !== "postgres" &&
			service.Service !== "db-migrate" &&
			service.Service !== "web" &&
			service.Service !== "worker" &&
			!isTerminalState(state)
		) {
			throw new Error(
				`Unrecognized live Compose service ${service.Service} cannot be proven compatible with this upgrade; stop it and upgrade it through an explicit runbook`,
			);
		}
		if (service.Service === "postgres" && state.startsWith("restarting")) {
			throw new Error("Cannot safely upgrade while managed PostgreSQL is restarting");
		}
		if (service.Service === "db-migrate" && !isTerminalState(state) && service.Name !== allowedRecoveryMigratorName) {
			throw new Error(
				`Cannot safely upgrade while database migrator ${service.Name ?? "db-migrate"} is ${service.State}; wait for it to finish and retry`,
			);
		}
	}
}

const SUPPORTED_UPGRADE_SERVICES: ReadonlySet<string> = new Set(["postgres", "db-migrate", "web", "worker"]);
export const ALL_PROFILE_SERVICE_CONFIG_ARGS = ["--profile", "*", "config", "--services"] as const;

export function assertSafeUpgradeServiceNames(serviceNames: readonly string[]): void {
	const unsupported = [...new Set(serviceNames)].filter((service) => !SUPPORTED_UPGRADE_SERVICES.has(service));
	if (unsupported.length > 0) {
		throw new Error(
			`Configured Compose services ${unsupported.join(", ")} cannot be proven compatible with this schema upgrade; stop them and upgrade through an explicit runbook`,
		);
	}
}

export function parseComposeServiceNames(output: string): string[] {
	return output
		.split("\n")
		.map((service) => service.trim())
		.filter(Boolean);
}

export function assertServicesQuiescent(
	services: readonly ComposeServiceState[],
	requiredServices: readonly string[],
): void {
	for (const requiredService of requiredServices) {
		const matchingServices = services.filter((service) => service.Service === requiredService);
		if (matchingServices.length === 0) {
			throw new Error(
				`${requiredService} disappeared during the maintenance stop; keep the maintenance fence in place and investigate before migrating`,
			);
		}
		if (matchingServices.some((service) => !isTerminalState(normalizedState(service)))) {
			const state = matchingServices.find((service) => !isTerminalState(normalizedState(service)))?.State;
			throw new Error(`${requiredService} remained ${state ?? "active"} after the maintenance stop`);
		}
		if (
			requiredService === "worker" &&
			matchingServices.some((service) => service.ExitCode === undefined || service.ExitCode !== 0)
		) {
			const exitCodes = matchingServices.map((service) => service.ExitCode ?? "unknown").join(", ");
			throw new Error(
				`worker did not complete its graceful drain (exit ${exitCodes}); keep the maintenance fence in place and investigate before migrating`,
			);
		}
	}
}

export function runningComposeServiceNames(services: readonly ComposeServiceState[]): string[] {
	return services.filter((service) => isLiveState(normalizedState(service))).map((service) => service.Service);
}

export function runningApplicationServiceNames(runningServices: readonly string[]): string[] {
	return runningServices.filter((service) => service === "web" || service === "worker");
}

export function applicationStartupOrder(services: readonly string[]): string[] {
	const priority = (service: string) => (service === "worker" ? 0 : service === "web" ? 1 : 2);
	return [...new Set(services)].sort((left, right) => priority(left) - priority(right));
}

const COMPOSE_DEPLOYMENT_MUTATION_COMMANDS: ReadonlySet<string> = new Set([
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
]);

const COMPOSE_READ_ONLY_COMMANDS: ReadonlySet<string> = new Set([
	"config",
	"events",
	"images",
	"logs",
	"ls",
	"port",
	"ps",
	"stats",
	"top",
	"version",
	"viz",
]);

const COMPOSE_GLOBAL_OPTIONS_WITH_VALUES: ReadonlySet<string> = new Set([
	"--ansi",
	"--env-file",
	"--file",
	"--parallel",
	"--profile",
	"--progress",
	"--project-directory",
	"--project-name",
	"-f",
	"-p",
]);

const COMPOSE_GLOBAL_BOOLEAN_OPTIONS: ReadonlySet<string> = new Set([
	"--all-resources",
	"--compatibility",
	"--dry-run",
	"--help",
	"--version",
	"-h",
	"-v",
]);

function composeCommand(args: readonly string[]): string | undefined | null {
	for (let index = 0; index < args.length; index += 1) {
		const argument = args[index]?.toLowerCase();
		if (!argument) continue;
		if (argument === "--") return args[index + 1]?.toLowerCase() ?? null;
		if (!argument.startsWith("-")) return argument;
		if (COMPOSE_GLOBAL_BOOLEAN_OPTIONS.has(argument)) continue;
		if (COMPOSE_GLOBAL_OPTIONS_WITH_VALUES.has(argument)) {
			if (index + 1 >= args.length) return null;
			index += 1;
			continue;
		}
		const optionName = argument.split("=", 1)[0];
		if (optionName && COMPOSE_GLOBAL_OPTIONS_WITH_VALUES.has(optionName) && argument.includes("=")) continue;
		return null;
	}
	return undefined;
}

export function composeCommandMayMutateDeployment(args: readonly string[]): boolean {
	const command = composeCommand(args);
	if (command === undefined) return false;
	if (command === null) return true;
	if (COMPOSE_DEPLOYMENT_MUTATION_COMMANDS.has(command)) return true;
	return !COMPOSE_READ_ONLY_COMMANDS.has(command);
}
