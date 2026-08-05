import path from "node:path";
import { renderedByHeader } from "./compose-pin.js";

export type PostgresMode = "docker" | "external";

export interface BuildComposeOptions {
	dev: boolean;
	postgresMode: PostgresMode;
	repoRoot: string;
	dockerDir?: string;
	port: number;
	version: string;
}

export function buildComposeYaml(options: BuildComposeOptions): string {
	const services: string[] = [];
	const volumes = new Set<string>();
	const dependencyConditions: Record<string, string> = {
		postgres: "service_healthy",
		"db-migrate": "service_completed_successfully",
	};
	const dockerfilePath = options.dockerDir
		? path.relative(options.repoRoot, path.join(options.dockerDir, "Dockerfile"))
		: "docker/Dockerfile";

	if (options.postgresMode === "docker") {
		services.push(buildPostgresService());
		volumes.add("postgres_data");
	}
	services.push(
		buildDbMigrateService({
			dev: options.dev,
			dockerfilePath,
			postgresMode: options.postgresMode,
			repoRoot: options.repoRoot,
			version: options.version,
		}),
	);

	const migrationDependency = ["db-migrate"];
	services.push(
		buildWebService({
			dev: options.dev,
			dependsOn: migrationDependency,
			dependencyConditions,
			repoRoot: options.repoRoot,
			dockerfilePath,
			port: options.port,
			version: options.version,
		}),
	);
	services.push(
		buildWorkerService({
			dev: options.dev,
			dependsOn: migrationDependency,
			dependencyConditions,
			repoRoot: options.repoRoot,
			dockerfilePath,
			version: options.version,
		}),
	);

	const lines = [renderedByHeader(options.version), "", "name: elmo", "", "services:"];
	lines.push(...services.map((service) => indentBlock(service, 2)));

	if (volumes.size > 0) {
		lines.push("", "volumes:");
		for (const volume of volumes) lines.push(`  ${volume}:`);
	}

	return `${lines.join("\n")}\n`;
}

function buildPostgresService(): string {
	return [
		"postgres:",
		"  image: postgres:16-alpine",
		"  environment:",
		"    POSTGRES_USER: postgres",
		"    POSTGRES_PASSWORD: postgres",
		"    POSTGRES_DB: elmo",
		"  volumes:",
		"    - postgres_data:/var/lib/postgresql/data",
		"  ports:",
		'    - "5432:5432"',
		"  healthcheck:",
		'    test: ["CMD-SHELL", "pg_isready -U postgres"]',
		"    interval: 5s",
		"    timeout: 5s",
		"    retries: 5",
		"    start_period: 30s",
	].join("\n");
}

function buildDbMigrateService(options: {
	dev: boolean;
	dockerfilePath: string;
	postgresMode: PostgresMode;
	repoRoot: string;
	version: string;
}): string {
	const lines = ["db-migrate:"];
	if (options.dev) {
		lines.push(
			"  build:",
			`    context: ${options.repoRoot}`,
			`    dockerfile: ${options.dockerfilePath}`,
			"    target: migrate",
			"    args:",
			`      ELMO_RELEASE_VERSION: ${options.version}`,
		);
	} else {
		lines.push(`  image: elmohq/elmo-db-migrate:${options.version}`);
	}

	lines.push(
		'  restart: "no"',
		"  environment:",
		`    DATABASE_URL: "\${DATABASE_URL:?DATABASE_URL is required}"`,
		`    DATABASE_URL_UNPOOLED: "\${DATABASE_URL_UNPOOLED:?DATABASE_URL_UNPOOLED is required}"`,
	);
	if (options.postgresMode === "docker") {
		lines.push("  depends_on:", "    postgres:", "      condition: service_healthy");
	}
	return lines.join("\n");
}

function buildWebService(options: {
	dev: boolean;
	dependsOn: string[];
	dependencyConditions: Record<string, string>;
	repoRoot: string;
	dockerfilePath: string;
	port: number;
	version: string;
}): string {
	const lines = ["web:"];
	if (options.dev) {
		lines.push(
			"  build:",
			`    context: ${options.repoRoot}`,
			`    dockerfile: ${options.dockerfilePath}`,
			"    target: web",
			"    args:",
			"      DEPLOYMENT_MODE: local",
			`      ELMO_RELEASE_VERSION: ${options.version}`,
		);
	} else {
		lines.push(`  image: elmohq/elmo-web:${options.version}`);
	}

	lines.push(
		"  env_file:",
		"    - path: .env",
		"      required: true",
		"  stop_grace_period: 65m",
		"  ports:",
		`    - "${options.port}:3000"`,
	);
	appendDependencies(lines, options.dependsOn, options.dependencyConditions);
	return lines.join("\n");
}

function buildWorkerService(options: {
	dev: boolean;
	dependsOn: string[];
	dependencyConditions: Record<string, string>;
	repoRoot: string;
	dockerfilePath: string;
	version: string;
}): string {
	const lines = ["worker:"];
	if (options.dev) {
		lines.push(
			"  build:",
			`    context: ${options.repoRoot}`,
			`    dockerfile: ${options.dockerfilePath}`,
			"    target: worker",
			"    args:",
			"      DEPLOYMENT_MODE: local",
			`      ELMO_RELEASE_VERSION: ${options.version}`,
		);
	} else {
		lines.push(`  image: elmohq/elmo-worker:${options.version}`);
	}

	lines.push("  env_file:", "    - path: .env", "      required: true", "  stop_grace_period: 65m");
	appendDependencies(lines, options.dependsOn, options.dependencyConditions);
	return lines.join("\n");
}

function appendDependencies(lines: string[], dependencies: string[], conditions: Record<string, string>): void {
	if (dependencies.length === 0) return;
	lines.push("  depends_on:");
	for (const service of dependencies) {
		lines.push(`    ${service}:`, `      condition: ${conditions[service] ?? "service_started"}`);
	}
}

function indentBlock(block: string, spaces: number): string {
	const indent = " ".repeat(spaces);
	return block
		.split("\n")
		.map((line) => `${indent}${line}`)
		.join("\n");
}
