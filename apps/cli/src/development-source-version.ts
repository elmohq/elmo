import fs from "node:fs/promises";
import path from "node:path";
import { parse } from "yaml";

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function buildContext(
	service: Record<string, unknown>,
	serviceName: "db-migrate" | "web" | "worker",
	configDir: string,
): Promise<string> {
	const build = service.build;
	const context =
		typeof build === "string" ? build : isRecord(build) && typeof build.context === "string" ? build.context : ".";
	if (context === "-" || /^[a-z][a-z0-9+.-]*:\/\//i.test(context) || context.startsWith("service:")) {
		throw new Error(`Cannot prove target release provenance for remote ${serviceName} build context ${context}`);
	}
	if (!isRecord(build) || build.dockerfile_inline !== undefined) {
		throw new Error(`Development ${serviceName} must use the repository docker/Dockerfile with an explicit target`);
	}
	const canonicalContext = await fs.realpath(path.resolve(configDir, context));
	const dockerfile = typeof build.dockerfile === "string" ? build.dockerfile : "Dockerfile";
	const canonicalDockerfile = await fs.realpath(path.resolve(canonicalContext, dockerfile));
	const expectedDockerfile = await fs.realpath(path.join(canonicalContext, "docker", "Dockerfile"));
	const expectedTarget = serviceName === "db-migrate" ? "migrate" : serviceName;
	if (canonicalDockerfile !== expectedDockerfile || build.target !== expectedTarget) {
		throw new Error(
			`Development ${serviceName} must build target ${expectedTarget} from the repository docker/Dockerfile`,
		);
	}
	return canonicalContext;
}

export async function assertDevelopmentSourceVersion(input: {
	composeContents: string;
	configDir: string;
	targetVersion: string;
}): Promise<void> {
	const document: unknown = parse(input.composeContents);
	if (!isRecord(document) || !isRecord(document.services)) {
		throw new Error("Development compose file does not define services");
	}

	const contexts = new Set<string>();
	for (const serviceName of ["web", "worker"] as const) {
		const service = document.services[serviceName];
		if (!isRecord(service) || service.build === undefined || service.image !== undefined) {
			throw new Error(`Development deployment requires a local ${serviceName} build context`);
		}
		contexts.add(await buildContext(service, serviceName, input.configDir));
	}
	const migrationService = document.services["db-migrate"];
	if (isRecord(migrationService) && migrationService.build !== undefined) {
		if (migrationService.image !== undefined) {
			throw new Error("Development db-migrate service cannot define both build and image");
		}
		contexts.add(await buildContext(migrationService, "db-migrate", input.configDir));
	}

	for (const context of contexts) {
		for (const expected of [
			{ relativePath: "apps/cli/package.json", name: "@elmohq/cli" },
			{ relativePath: "apps/web/package.json", name: "@workspace/web" },
			{ relativePath: "apps/worker/package.json", name: "@workspace/worker" },
			{ relativePath: "packages/lib/package.json", name: "@workspace/lib" },
		]) {
			const manifestPath = path.join(context, expected.relativePath);
			let manifest: unknown;
			try {
				manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));
			} catch (error) {
				throw new Error(`Cannot verify the Elmo release manifest at ${manifestPath}`, { cause: error });
			}
			if (!isRecord(manifest) || manifest.name !== expected.name || manifest.version !== input.targetVersion) {
				throw new Error(
					`Development source at ${context} does not declare Elmo release ${input.targetVersion} in ${expected.relativePath}; check out that exact release before upgrading`,
				);
			}
		}
	}
}
