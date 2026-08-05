import path from "node:path";
import { parse } from "yaml";

const CONNECTIVITY_KEYS = ["dns", "dns_opt", "dns_search", "extra_hosts", "network_mode", "networks"] as const;
const EXECUTION_OVERRIDE_KEYS = [
	"cap_add",
	"command",
	"develop",
	"device_cgroup_rules",
	"devices",
	"entrypoint",
	"extends",
	"external_links",
	"group_add",
	"healthcheck",
	"ipc",
	"links",
	"pid",
	"post_start",
	"pre_stop",
	"privileged",
	"provider",
	"runtime",
	"security_opt",
	"stop_signal",
	"tmpfs",
	"use_api_socket",
	"user",
	"userns_mode",
	"uts",
	"volumes_from",
	"working_dir",
] as const;
const DATABASE_CLIENT_SERVICES = ["db-migrate", "web", "worker"] as const;

export interface DatabaseComposeAnalysis {
	connectivity: Record<string, unknown>;
	unsafeExecutionOverrides: Array<{ service: string; fields: string[] }>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function safeMountTarget(target: unknown): boolean {
	if (typeof target !== "string") return false;
	if (!path.posix.isAbsolute(target) || target.includes("\0") || path.posix.normalize(target) !== target) return false;
	if (target.split("/").some((segment) => segment === "." || segment === "..")) return false;
	if (
		["/certs", "/run/configs", "/run/secrets", "/var/run/postgresql", "/var/run/secrets"].some(
			(prefix) => target === prefix || target.startsWith(`${prefix}/`),
		)
	) {
		return true;
	}
	return (
		target.startsWith("/etc/ssl/certs/") ||
		target.startsWith("/etc/pki/ca-trust/source/anchors/") ||
		target.startsWith("/etc/pki/tls/certs/")
	);
}

function safeShortVolume(value: string): boolean {
	const segments = value.split(":");
	if (segments.length < 3) return false;
	const options = segments.at(-1)?.split(",") ?? [];
	const target = segments.at(-2);
	return options.includes("ro") && safeMountTarget(target);
}

function safeVolume(value: unknown): boolean {
	if (typeof value === "string") return safeShortVolume(value);
	return isRecord(value) && value.read_only === true && safeMountTarget(value.target);
}

function safeSecret(value: unknown): boolean {
	if (typeof value === "string") return value.length > 0;
	if (!isRecord(value) || typeof value.source !== "string") return false;
	if (value.target === undefined) return true;
	return (
		safeMountTarget(value.target) ||
		(typeof value.target === "string" &&
			value.target !== "." &&
			value.target !== ".." &&
			/^[A-Za-z0-9._-]+$/u.test(value.target))
	);
}

function normalizeSecret(value: unknown): unknown {
	if (
		isRecord(value) &&
		typeof value.target === "string" &&
		value.target !== "." &&
		value.target !== ".." &&
		/^[A-Za-z0-9._-]+$/u.test(value.target)
	) {
		return { ...value, target: `/run/secrets/${value.target}` };
	}
	return value;
}

function safeConfig(value: unknown): boolean {
	return isRecord(value) && typeof value.source === "string" && safeMountTarget(value.target);
}

function classifyResources(service: Record<string, unknown>): {
	connectivity: Record<string, unknown>;
	unsafeFields: string[];
} {
	const connectivity: Record<string, unknown> = {};
	const unsafeFields = EXECUTION_OVERRIDE_KEYS.filter((key) => service[key] !== undefined) as string[];
	for (const key of CONNECTIVITY_KEYS) {
		if (service[key] !== undefined) connectivity[key] = service[key];
	}

	if (service.volumes !== undefined) {
		if (!Array.isArray(service.volumes) || !service.volumes.every(safeVolume)) unsafeFields.push("volumes");
		else if (service.volumes.length > 0) connectivity.volumes = service.volumes;
	}
	if (service.secrets !== undefined) {
		if (!Array.isArray(service.secrets) || !service.secrets.every(safeSecret)) unsafeFields.push("secrets");
		else if (service.secrets.length > 0) connectivity.secrets = service.secrets.map(normalizeSecret);
	}
	if (service.configs !== undefined) {
		if (!Array.isArray(service.configs) || !service.configs.every(safeConfig)) unsafeFields.push("configs");
		else if (service.configs.length > 0) connectivity.configs = service.configs;
	}
	return { connectivity, unsafeFields: [...new Set(unsafeFields)] };
}

function normalizedConnectivity(value: Record<string, unknown>): string {
	return JSON.stringify(Object.fromEntries(Object.entries(value).sort(([left], [right]) => left.localeCompare(right))));
}

/** Parses connectivity and execution safety once so validation and utility containers cannot disagree. */
export function analyzeDatabaseClientCompose(composeContents: string): DatabaseComposeAnalysis {
	const document: unknown = parse(composeContents, { merge: true });
	if (!isRecord(document) || !isRecord(document.services)) {
		throw new Error("Compose file does not define services");
	}
	if (document.include !== undefined) {
		throw new Error(
			"Compose include cannot be proven identical for application and upgrade utility containers; inline the included database-client configuration before this schema upgrade",
		);
	}

	const candidates: Array<{ name: string; connectivity: Record<string, unknown> }> = [];
	const unsafeExecutionOverrides: Array<{ service: string; fields: string[] }> = [];
	for (const name of DATABASE_CLIENT_SERVICES) {
		const service = document.services[name];
		if (service === undefined) continue;
		if (!isRecord(service)) throw new Error(`Compose service ${name} is invalid`);
		const classified = classifyResources(service);
		if (classified.unsafeFields.length > 0) {
			unsafeExecutionOverrides.push({ service: name, fields: classified.unsafeFields });
		}
		candidates.push({ name, connectivity: classified.connectivity });
	}
	const firstCandidate = candidates[0];
	if (!firstCandidate) throw new Error("Compose file does not define an Elmo database client service");

	if (candidates.length > 1) {
		const expected = normalizedConnectivity(firstCandidate.connectivity);
		const incompatible = candidates.find(({ connectivity }) => normalizedConnectivity(connectivity) !== expected);
		if (incompatible) {
			throw new Error(
				`Compose database connectivity differs between ${firstCandidate.name} and ${incompatible.name}; use the same networks, DNS, and read-only credential mounts for every database client`,
			);
		}
	}

	const connectivity = { ...firstCandidate.connectivity };
	const dbMigrate = document.services["db-migrate"];
	if (isRecord(dbMigrate)) {
		if (Array.isArray(dbMigrate.depends_on)) {
			if (dbMigrate.depends_on.includes("postgres")) connectivity.depends_on = ["postgres"];
		} else if (isRecord(dbMigrate.depends_on) && dbMigrate.depends_on.postgres !== undefined) {
			connectivity.depends_on = { postgres: dbMigrate.depends_on.postgres };
		}
	}

	return { connectivity, unsafeExecutionOverrides };
}

export function assertSafeDatabaseClientExecution(analysis: DatabaseComposeAnalysis): void {
	if (analysis.unsafeExecutionOverrides.length === 0) return;
	const details = analysis.unsafeExecutionOverrides
		.map(({ service, fields }) => `${service} overrides ${fields.join(", ")}`)
		.join("; ");
	throw new Error(
		`Compose ${details}; schema-boundary upgrades require attested image execution and only allow consistent network settings and read-only database credential mounts`,
	);
}

export function databaseUtilityConnectivity(composeContents: string): Record<string, unknown> {
	const analysis = analyzeDatabaseClientCompose(composeContents);
	assertSafeDatabaseClientExecution(analysis);
	return analysis.connectivity;
}
