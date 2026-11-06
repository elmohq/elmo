import fs from "node:fs/promises";
import path from "node:path";
import { refreshHeaderVersion, renderedByHeader, repinImages } from "./compose-pin.js";
import type { PostgresMode } from "./config.js";
import { indentBlock } from "./util.js";

// Edits the file in place rather than re-rendering it, so the user's own changes survive.
export async function repinComposeImages(composePath: string, version: string): Promise<void> {
	const contents = await fs.readFile(composePath, "utf8");
	await fs.writeFile(composePath, refreshHeaderVersion(repinImages(contents, version), version), "utf8");
}

export async function refreshRenderedVersion(filePath: string, version: string): Promise<void> {
	try {
		const contents = await fs.readFile(filePath, "utf8");
		await fs.writeFile(filePath, refreshHeaderVersion(contents, version), "utf8");
	} catch {
		// .env may be absent in some setups.
	}
}

export function buildComposeYaml(options: {
	dev: boolean;
	postgresMode: PostgresMode;
	repoRoot: string;
	dockerDir?: string;
	port: number;
	version: string;
}): string {
	const services: string[] = [];
	const volumes = new Set<string>();

	const dependsOnWeb: string[] = [];
	const dependsOnWorker: string[] = [];

	const dependencyConditions: Record<string, string> = {
		postgres: "service_healthy",
		"db-migrate": "service_completed_successfully",
	};

	const dockerfilePath = options.dockerDir
		? path.relative(options.repoRoot, path.join(options.dockerDir, "Dockerfile"))
		: "docker/Dockerfile";

	if (options.postgresMode === "docker") {
		services.push(buildPostgresService());
		services.push(
			buildDbMigrateService({
				dev: options.dev,
				dockerfilePath,
				repoRoot: options.repoRoot,
				version: options.version,
			}),
		);
		dependsOnWeb.push("db-migrate");
		dependsOnWorker.push("db-migrate");
		volumes.add("postgres_data");
	}

	services.push(
		buildWebService({
			dev: options.dev,
			dependsOn: dependsOnWeb,
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
			dependsOn: dependsOnWorker,
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
		for (const volume of volumes) {
			lines.push(`  ${volume}:`);
		}
	}

	return `${lines.join("\n")}\n`;
}

function buildPostgresService(): string {
	return [
		"postgres:",
		"  image: postgres:18-alpine",
		"  environment:",
		"    POSTGRES_USER: postgres",
		"    POSTGRES_PASSWORD: postgres",
		"    POSTGRES_DB: elmo",
		"  volumes:",
		// PostgreSQL 18 declares its volume at this parent; mounting the versioned
		// PGDATA child instead lands the cluster in an anonymous volume that recreation loses.
		"    - postgres_data:/var/lib/postgresql",
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
		);
	} else {
		lines.push(`  image: elmohq/elmo-db-migrate:${options.version}`);
	}

	lines.push(
		"  environment:",
		"    - DATABASE_URL=postgres://postgres:postgres@postgres:5432/elmo",
		"  depends_on:",
		"    postgres:",
		"      condition: service_healthy",
	);

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
		);
	} else {
		lines.push(`  image: elmohq/elmo-web:${options.version}`);
	}

	lines.push("  env_file:", "    - path: .env", "      required: true", "  ports:", `    - "${options.port}:3000"`);

	if (options.dependsOn.length > 0) {
		lines.push("  depends_on:");
		for (const service of options.dependsOn) {
			const condition = options.dependencyConditions[service] ?? "service_started";
			lines.push(`    ${service}:`, `      condition: ${condition}`);
		}
	}

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
		);
	} else {
		lines.push(`  image: elmohq/elmo-worker:${options.version}`);
	}

	lines.push("  env_file:", "    - path: .env", "      required: true");

	// The worker drains jobs for 30s on SIGTERM; Compose's 10s default would kill
	// it mid-evaluation and waste a provider call already paid for.
	lines.push("  stop_grace_period: 35s");

	if (options.dependsOn.length > 0) {
		lines.push("  depends_on:");
		for (const service of options.dependsOn) {
			const condition = options.dependencyConditions[service] ?? "service_started";
			lines.push(`    ${service}:`, `      condition: ${condition}`);
		}
	}

	return lines.join("\n");
}
