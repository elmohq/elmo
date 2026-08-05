export const ROLLBACK_SCHEMA_COMPATIBILITY_LABEL = "com.elmohq.elmo.schema-compatibility";
export const RELEASE_VERSION_LABEL = "com.elmohq.elmo.release-version";
export const RUNTIME_FENCE_GENERATION_LABEL = "com.elmohq.elmo.runtime-fence-generation";
export const CLOUD_SCHEMA_COMPATIBILITY = "0020";
export const INCOMPATIBLE_RUNTIME_FENCE_GENERATIONS: Readonly<
	Record<typeof CLOUD_SCHEMA_COMPATIBILITY, readonly string[]>
> = {
	[CLOUD_SCHEMA_COMPATIBILITY]: ["pre-0020"],
};

export interface RollbackRuntimeImage {
	service: "web" | "worker";
	imageId: string;
	reference: string;
	runtimeFenceGeneration?: string;
}

export class TargetRecoveryFenceError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "TargetRecoveryFenceError";
	}
}

export function requiresHardRecoveryGuidance(input: {
	crossesSchemaBoundary: boolean;
	databaseBoundaryMayHaveAdvanced: boolean;
	targetRecoveryFenceRequired: boolean;
	rollbackCause: unknown;
}): boolean {
	return (
		(input.crossesSchemaBoundary && input.databaseBoundaryMayHaveAdvanced) ||
		input.targetRecoveryFenceRequired ||
		input.rollbackCause instanceof TargetRecoveryFenceError
	);
}

export function requiresTargetRecoveryFence(input: {
	crossesSchemaBoundary: boolean;
	databaseBoundaryMayHaveAdvanced: boolean;
	rollbackSchemaCompatibility: string | null;
	rollbackImageIdsAvailable: boolean;
}): boolean {
	return (
		input.crossesSchemaBoundary &&
		input.databaseBoundaryMayHaveAdvanced &&
		(input.rollbackSchemaCompatibility !== CLOUD_SCHEMA_COMPATIBILITY || !input.rollbackImageIdsAvailable)
	);
}

interface ComposeContainer {
	ID?: string;
	Name?: string;
	Service: string;
	State: string;
}

type CaptureDocker = (args: string[]) => Promise<string>;
type RunDocker = (args: string[]) => Promise<void>;
type AttestedImageService = "web" | "worker" | "dbMigrate";

const CONTAINER_PATH = "/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin";

interface ImageConfig {
	Cmd?: unknown;
	Entrypoint?: unknown;
	Env?: unknown;
	Healthcheck?: {
		Interval?: unknown;
		Retries?: unknown;
		StartPeriod?: unknown;
		Test?: unknown;
		Timeout?: unknown;
	} | null;
	Shell?: unknown;
	StopSignal?: unknown;
	User?: unknown;
	Volumes?: unknown;
	WorkingDir?: unknown;
}

function parseLabels(output: string): Record<string, unknown> | null {
	try {
		const labels: unknown = JSON.parse(output);
		return typeof labels === "object" && labels !== null && !Array.isArray(labels)
			? (labels as Record<string, unknown>)
			: null;
	} catch {
		return null;
	}
}

function parseImageConfig(output: string): ImageConfig | null {
	try {
		const config: unknown = JSON.parse(output);
		return typeof config === "object" && config !== null && !Array.isArray(config) ? (config as ImageConfig) : null;
	} catch {
		return null;
	}
}

function exactStringArray(value: unknown, expected: readonly string[]): boolean {
	return (
		Array.isArray(value) && value.length === expected.length && value.every((item, index) => item === expected[index])
	);
}

function imageEnvironment(config: ImageConfig): Map<string, string> | null {
	if (!Array.isArray(config.Env)) return null;
	const environment = new Map<string, string>();
	for (const entry of config.Env) {
		if (typeof entry !== "string") return null;
		const separator = entry.indexOf("=");
		if (separator <= 0) return null;
		const key = entry.slice(0, separator);
		if (environment.has(key)) return null;
		environment.set(key, entry.slice(separator + 1));
	}
	return environment;
}

function hasUnsafeImageEnvironment(environment: ReadonlyMap<string, string>): boolean {
	for (const key of environment.keys()) {
		if (
			key === "NODE_OPTIONS" ||
			key === "NODE_PATH" ||
			key.startsWith("LD_") ||
			key.startsWith("DYLD_") ||
			key.startsWith("OPENSSL_") ||
			key.startsWith("PG")
		) {
			return true;
		}
	}
	return false;
}

function hasExactEnvironmentKeys(environment: ReadonlyMap<string, string>, expected: readonly string[]): boolean {
	return (
		environment.size === expected.length &&
		expected.every((key) => environment.has(key)) &&
		/^24\.[0-9]+\.[0-9]+$/u.test(environment.get("NODE_VERSION") ?? "") &&
		/^1\.22\.[0-9]+$/u.test(environment.get("YARN_VERSION") ?? "")
	);
}

function healthcheckMatches(config: ImageConfig, command: string): boolean {
	const healthcheck = config.Healthcheck;
	if (!healthcheck || Object.keys(healthcheck).sort().join(",") !== "Interval,Retries,StartPeriod,Test,Timeout") {
		return false;
	}
	return (
		exactStringArray(healthcheck.Test, ["CMD-SHELL", command]) &&
		healthcheck.Interval === 5_000_000_000 &&
		healthcheck.Timeout === 5_000_000_000 &&
		healthcheck.StartPeriod === 30_000_000_000 &&
		healthcheck.Retries === 30
	);
}

function hasSafeInheritedExecutionConfig(config: ImageConfig): boolean {
	const shellIsEmpty =
		config.Shell === undefined || config.Shell === null || (Array.isArray(config.Shell) && config.Shell.length === 0);
	const volumesAreEmpty =
		config.Volumes === undefined ||
		config.Volumes === null ||
		(typeof config.Volumes === "object" &&
			!Array.isArray(config.Volumes) &&
			Object.keys(config.Volumes as Record<string, unknown>).length === 0);
	return (
		shellIsEmpty &&
		volumesAreEmpty &&
		(config.StopSignal === undefined ||
			config.StopSignal === null ||
			config.StopSignal === "" ||
			config.StopSignal === "SIGTERM")
	);
}

function hasAttestedExecutionContract(
	service: AttestedImageService,
	config: ImageConfig | null,
	expectedRuntimeFenceGeneration: string,
): boolean {
	if (config?.WorkingDir !== "/app") return false;
	if (!hasSafeInheritedExecutionConfig(config)) return false;
	const environment = imageEnvironment(config);
	if (!environment || environment.get("PATH") !== CONTAINER_PATH || hasUnsafeImageEnvironment(environment)) {
		return false;
	}

	if (service === "web") {
		return (
			hasExactEnvironmentKeys(environment, [
				"PATH",
				"NODE_VERSION",
				"YARN_VERSION",
				"NODE_ENV",
				"ELMO_RUNTIME_FENCE_GENERATION",
				"SERVER_SHUTDOWN_TIMEOUT",
				"PORT",
				"HOST",
			]) &&
			config.User === "elmo" &&
			exactStringArray(config.Entrypoint, ["/entrypoint.sh"]) &&
			exactStringArray(config.Cmd, ["node", ".output/server/index.mjs"]) &&
			environment.get("NODE_ENV") === "production" &&
			environment.get("ELMO_RUNTIME_FENCE_GENERATION") === expectedRuntimeFenceGeneration &&
			environment.get("SERVER_SHUTDOWN_TIMEOUT") === "3600" &&
			environment.get("PORT") === "3000" &&
			environment.get("HOST") === "0.0.0.0" &&
			healthcheckMatches(
				config,
				"curl --fail --silent http://127.0.0.1:3000/api/setup-status | grep --quiet '\"ready\":true'",
			)
		);
	}

	if (service === "worker") {
		return (
			hasExactEnvironmentKeys(environment, [
				"PATH",
				"NODE_VERSION",
				"YARN_VERSION",
				"NODE_ENV",
				"ELMO_RUNTIME_FENCE_GENERATION",
			]) &&
			config.User === "worker" &&
			exactStringArray(config.Entrypoint, ["/entrypoint.sh"]) &&
			exactStringArray(config.Cmd, ["./node_modules/.bin/tsx", "src/index.ts"]) &&
			environment.get("NODE_ENV") === "production" &&
			environment.get("ELMO_RUNTIME_FENCE_GENERATION") === expectedRuntimeFenceGeneration &&
			healthcheckMatches(config, "test -f /tmp/elmo-worker-ready && kill -0 1")
		);
	}

	return (
		hasExactEnvironmentKeys(environment, ["PATH", "NODE_VERSION", "YARN_VERSION"]) &&
		(config.User === "" || config.User === undefined) &&
		exactStringArray(config.Entrypoint, ["docker-entrypoint.sh"]) &&
		exactStringArray(config.Cmd, ["./node_modules/.bin/tsx", "scripts/migrate.ts"]) &&
		(config.Healthcheck === null || config.Healthcheck === undefined)
	);
}

export async function requireSchemaCompatibleImages<T extends AttestedImageService>(input: {
	images: Readonly<{ [K in T]: string }>;
	expectedReleaseVersion: string;
	expectedRuntimeFenceGeneration: string;
	capture: CaptureDocker;
}): Promise<{ [K in T]: string }> {
	const imageIds = {} as { [K in T]: string };
	for (const service of Object.keys(input.images) as T[]) {
		const reference = input.images[service];
		const imageId = (await input.capture(["image", "inspect", "--format", "{{.Id}}", reference])).trim();
		if (!/^sha256:[a-f0-9]+$/iu.test(imageId)) {
			throw new Error(`Cannot resolve the prepared ${service} image ID`);
		}
		const labels = parseLabels(
			await input.capture(["image", "inspect", "--format", "{{json .Config.Labels}}", imageId]),
		);
		if (labels?.[ROLLBACK_SCHEMA_COMPATIBILITY_LABEL] !== CLOUD_SCHEMA_COMPATIBILITY) {
			throw new Error(
				`Prepared ${service} image ${reference} does not attest schema compatibility ${CLOUD_SCHEMA_COMPATIBILITY}`,
			);
		}
		if (labels[RELEASE_VERSION_LABEL] !== input.expectedReleaseVersion) {
			throw new Error(`Prepared ${service} image ${reference} is not release ${input.expectedReleaseVersion}`);
		}
		if (labels[RUNTIME_FENCE_GENERATION_LABEL] !== input.expectedRuntimeFenceGeneration) {
			throw new Error(
				`Prepared ${service} image ${reference} does not attest runtime fence generation ${input.expectedRuntimeFenceGeneration}`,
			);
		}
		const config = parseImageConfig(await input.capture(["image", "inspect", "--format", "{{json .Config}}", imageId]));
		if (!hasAttestedExecutionContract(service, config, input.expectedRuntimeFenceGeneration)) {
			throw new Error(`Prepared ${service} image ${reference} does not match the trusted execution contract`);
		}
		imageIds[service] = imageId;
	}
	return imageIds;
}

function isLive(state: string): boolean {
	const normalized = state.trim().toLowerCase();
	return normalized.startsWith("running") || normalized.startsWith("restarting");
}

async function containerImageId(container: ComposeContainer, capture: CaptureDocker): Promise<string | null> {
	const identifier = container.ID || container.Name;
	if (!identifier) return null;
	const imageId = (await capture(["container", "inspect", "--format", "{{.Image}}", identifier])).trim();
	return /^sha256:[a-f0-9]+$/iu.test(imageId) ? imageId : null;
}

export async function captureRollbackRuntimeImages(input: {
	services: readonly ("web" | "worker")[];
	containers: readonly ComposeContainer[];
	configuredImages: Readonly<Partial<Record<"web" | "worker", string>>>;
	capture: CaptureDocker;
}): Promise<RollbackRuntimeImage[]> {
	const result: RollbackRuntimeImage[] = [];
	for (const service of [...new Set(input.services)]) {
		const containers = input.containers.filter((container) => container.Service === service);
		if (containers.length === 0) throw new Error(`Cannot checkpoint missing ${service} containers for rollback`);
		const imageIds = new Set<string>();
		for (const container of containers) {
			const imageId = await containerImageId(container, input.capture);
			if (!imageId) throw new Error(`Cannot resolve the current ${service} container image`);
			imageIds.add(imageId);
		}
		if (imageIds.size !== 1) throw new Error(`Cannot checkpoint mixed ${service} image versions for rollback`);
		const reference = input.configuredImages[service];
		if (!reference) throw new Error(`Cannot resolve the configured ${service} image for rollback`);
		const configuredImageId = (await input.capture(["image", "inspect", "--format", "{{.Id}}", reference])).trim();
		const imageId = [...imageIds][0] as string;
		if (configuredImageId !== imageId) {
			throw new Error(
				`Current ${service} image ${imageId} does not match configured image ${reference}; reconcile it before upgrading`,
			);
		}
		const labels = parseLabels(
			await input.capture(["image", "inspect", "--format", "{{json .Config.Labels}}", imageId]),
		);
		const runtimeFenceGeneration = labels?.[RUNTIME_FENCE_GENERATION_LABEL];
		result.push({
			service,
			imageId,
			reference,
			...(typeof runtimeFenceGeneration === "string" ? { runtimeFenceGeneration } : {}),
		});
	}
	return result;
}

export async function restoreRollbackRuntimeImages(input: {
	images: readonly RollbackRuntimeImage[];
	capture: CaptureDocker;
	run: RunDocker;
}): Promise<void> {
	for (const image of input.images) {
		const storedImageId = (await input.capture(["image", "inspect", "--format", "{{.Id}}", image.imageId])).trim();
		if (storedImageId !== image.imageId) {
			throw new Error(`Exact rollback image ${image.imageId} for ${image.service} is unavailable`);
		}
		if (!image.reference.includes("@") && !image.reference.startsWith("sha256:")) {
			await input.run(["image", "tag", image.imageId, image.reference]);
		}
		const restoredReferenceId = (
			await input.capture(["image", "inspect", "--format", "{{.Id}}", image.reference])
		).trim();
		if (restoredReferenceId !== image.imageId) {
			throw new Error(`Configured rollback reference ${image.reference} does not resolve to ${image.imageId}`);
		}
	}
}

export async function assertComposeServiceImageIds(input: {
	images: readonly Pick<RollbackRuntimeImage, "service" | "imageId">[];
	containers: readonly ComposeContainer[];
	capture: CaptureDocker;
}): Promise<void> {
	for (const expected of input.images) {
		const containers = input.containers.filter((container) => container.Service === expected.service);
		if (containers.length === 0) throw new Error(`Expected ${expected.service} container was not created`);
		for (const container of containers) {
			const imageId = await containerImageId(container, input.capture);
			if (imageId !== expected.imageId) {
				throw new Error(`Container for ${expected.service} does not use checkpointed image ${expected.imageId}`);
			}
		}
	}
}

export interface RollbackRuntimeAttestation {
	schemaCompatibility: typeof CLOUD_SCHEMA_COMPATIBILITY;
	imageIds: Record<string, string>;
	runtimeFenceGeneration: string | null;
}

export async function attestRollbackRuntime(input: {
	servicesToRestart: readonly string[];
	containers: readonly ComposeContainer[];
	configuredImages?: Readonly<Record<string, string>>;
	expectedImageIds?: Readonly<Record<string, string>>;
	expectedReleaseVersion?: string;
	expectedRuntimeFenceGeneration?: string;
	capture: CaptureDocker;
}): Promise<RollbackRuntimeAttestation | null> {
	const attestedImageIds: Record<string, string> = {};
	const runtimeFenceGenerations = new Set<string>();
	for (const service of input.servicesToRestart) {
		const containers = input.containers.filter((container) => container.Service === service);
		if (containers.length === 0 || containers.some((container) => !isLive(container.State))) return null;
		const observedImageIds = new Set<string>();
		for (const container of containers) {
			const imageId = await containerImageId(container, input.capture);
			if (!imageId) return null;
			if (input.expectedImageIds?.[service] && imageId !== input.expectedImageIds[service]) return null;
			observedImageIds.add(imageId);
			const labels = parseLabels(
				await input.capture(["image", "inspect", "--format", "{{json .Config.Labels}}", imageId]),
			);
			if (labels?.[ROLLBACK_SCHEMA_COMPATIBILITY_LABEL] !== CLOUD_SCHEMA_COMPATIBILITY) return null;
			if (input.expectedReleaseVersion && labels[RELEASE_VERSION_LABEL] !== input.expectedReleaseVersion) return null;
			const runtimeFenceGeneration = labels[RUNTIME_FENCE_GENERATION_LABEL];
			if (typeof runtimeFenceGeneration !== "string" || runtimeFenceGeneration.length === 0) return null;
			if (input.expectedRuntimeFenceGeneration && runtimeFenceGeneration !== input.expectedRuntimeFenceGeneration) {
				return null;
			}
			const attestedService = service === "web" || service === "worker" ? service : null;
			if (!attestedService) return null;
			const config = parseImageConfig(
				await input.capture(["image", "inspect", "--format", "{{json .Config}}", imageId]),
			);
			if (!hasAttestedExecutionContract(attestedService, config, runtimeFenceGeneration)) return null;
			runtimeFenceGenerations.add(runtimeFenceGeneration);
		}
		if (observedImageIds.size !== 1) return null;
		const imageId = [...observedImageIds][0] as string;
		attestedImageIds[service] = imageId;
		const configuredImage = input.configuredImages?.[service];
		if (configuredImage) {
			const configuredImageId = (
				await input.capture(["image", "inspect", "--format", "{{.Id}}", configuredImage])
			).trim();
			if (configuredImageId !== imageId) return null;
		}
	}
	if (input.servicesToRestart.length === 0 || runtimeFenceGenerations.size !== 1) return null;
	return {
		schemaCompatibility: CLOUD_SCHEMA_COMPATIBILITY,
		imageIds: attestedImageIds,
		runtimeFenceGeneration: [...runtimeFenceGenerations][0] ?? null,
	};
}

export async function attestRollbackSchemaCompatibility(input: {
	servicesToRestart: readonly string[];
	containers: readonly ComposeContainer[];
	configuredImages?: Readonly<Record<string, string>>;
	expectedImageIds?: Readonly<Record<string, string>>;
	expectedReleaseVersion?: string;
	expectedRuntimeFenceGeneration?: string;
	capture: CaptureDocker;
}): Promise<string | null> {
	return (await attestRollbackRuntime(input))?.schemaCompatibility ?? null;
}
