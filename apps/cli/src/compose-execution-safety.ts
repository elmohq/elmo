import { parse } from "yaml";
import { analyzeDatabaseClientCompose, assertSafeDatabaseClientExecution } from "./database-compose-connectivity.js";

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function environmentRecord(value: unknown): Record<string, unknown> {
	if (isRecord(value)) return value;
	if (!Array.isArray(value)) return {};
	return Object.fromEntries(
		value
			.filter((entry): entry is string => typeof entry === "string" && entry.includes("="))
			.map((entry) => {
				const separator = entry.indexOf("=");
				return [entry.slice(0, separator), entry.slice(separator + 1)];
			}),
	);
}

function environmentNames(value: unknown): string[] {
	if (isRecord(value)) return Object.keys(value);
	if (!Array.isArray(value)) return [];
	return value.flatMap((entry) => {
		if (typeof entry !== "string") return [];
		const separator = entry.indexOf("=");
		const name = (separator === -1 ? entry : entry.slice(0, separator)).trim();
		return name ? [name] : [];
	});
}

function dangerousRuntimeEnvironmentName(name: string): boolean {
	const normalized = name.toUpperCase();
	return (
		normalized === "NODE_OPTIONS" ||
		normalized === "NODE_PATH" ||
		normalized === "PATH" ||
		normalized.startsWith("LD_") ||
		normalized.startsWith("DYLD_") ||
		normalized.startsWith("OPENSSL_") ||
		normalized.startsWith("PG")
	);
}

function assertSafeRuntimeEnvironment(serviceName: string, environment: unknown): void {
	const unsafe = environmentNames(environment).filter(dangerousRuntimeEnvironmentName);
	if (unsafe.length > 0) {
		throw new Error(
			`Rendered Compose service ${serviceName} overrides execution or PostgreSQL routing through ${[
				...new Set(unsafe),
			].join(", ")}`,
		);
	}
}

export function assertSchemaBoundaryExecutionConfig(
	composeContents: string,
	expectedDatabaseEnvironment?: { databaseUrl: string; unpooledDatabaseUrl: string; runtimeFenceGeneration: string },
): void {
	assertSafeDatabaseClientExecution(analyzeDatabaseClientCompose(composeContents));
	const document: unknown = parse(composeContents, { merge: true });
	if (!isRecord(document) || !isRecord(document.services)) throw new Error("Compose file does not define services");
	for (const serviceName of ["db-migrate", "web", "worker"] as const) {
		const service = document.services[serviceName];
		if (service === undefined) continue;
		if (!isRecord(service)) throw new Error(`Compose service ${serviceName} is invalid`);
		assertSafeRuntimeEnvironment(serviceName, service.environment);
	}
	if (!expectedDatabaseEnvironment) return;
	for (const serviceName of ["web", "worker"] as const) {
		const service = document.services[serviceName];
		if (!isRecord(service)) throw new Error(`Compose service ${serviceName} is invalid`);
		const environment = environmentRecord(service.environment);
		if (
			environment.DATABASE_URL !== expectedDatabaseEnvironment.databaseUrl ||
			environment.DATABASE_URL_UNPOOLED !== expectedDatabaseEnvironment.unpooledDatabaseUrl
		) {
			throw new Error(
				`Rendered Compose service ${serviceName} does not use the deployment's DATABASE_URL and DATABASE_URL_UNPOOLED`,
			);
		}
		if (
			environment.ELMO_RUNTIME_FENCE_GENERATION !== undefined &&
			environment.ELMO_RUNTIME_FENCE_GENERATION !== expectedDatabaseEnvironment.runtimeFenceGeneration
		) {
			throw new Error(`Rendered Compose service ${serviceName} overrides the attested runtime fence generation`);
		}
	}
}
