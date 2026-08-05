// Pure helpers for the Docker image tags + version header that elmo writes into
// the generated compose / env files. Kept side-effect-free (no fs) so the
// upgrade re-pin path stays unit-testable; index.ts wraps these with file I/O.

import { parse, parseDocument } from "yaml";

export interface ImageReleasePlan {
	composeContents: string;
	images: {
		dbMigrate: string;
		web: string;
		worker: string;
	};
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function imageRepository(reference: string, service: string): string {
	if (!reference || /[\s$]/u.test(reference) || reference.includes("://")) {
		throw new Error(`Elmo Compose service ${service} must use a literal Docker image reference`);
	}
	const withoutDigest = reference.split("@", 1)[0] as string;
	const lastSlash = withoutDigest.lastIndexOf("/");
	const lastColon = withoutDigest.lastIndexOf(":");
	const repository = lastColon > lastSlash ? withoutDigest.slice(0, lastColon) : withoutDigest;
	if (!repository || repository.endsWith("/")) {
		throw new Error(`Elmo Compose service ${service} has an invalid Docker image reference`);
	}
	return repository;
}

function targetReference(reference: string, service: string, version: string): string {
	return `${imageRepository(reference, service)}:${version}`;
}

export function enforceRuntimeDrainContract(contents: string): string {
	const document = parseDocument(contents);
	if (document.errors.length > 0) throw document.errors[0];
	const parsed: unknown = document.toJS();
	if (
		!isRecord(parsed) ||
		!isRecord(parsed.services) ||
		!isRecord(parsed.services.web) ||
		!isRecord(parsed.services.worker)
	) {
		throw new Error("Compose file does not define web and worker services");
	}
	document.setIn(["services", "web", "stop_grace_period"], "65m");
	document.setIn(["services", "worker", "stop_grace_period"], "65m");
	return document.toString();
}

export function planImageRelease(contents: string, version: string): ImageReleasePlan {
	const parsed: unknown = parse(contents);
	if (!isRecord(parsed) || !isRecord(parsed.services)) {
		throw new Error("Compose file does not define services");
	}

	const targets = new Map<string, string>();
	for (const serviceName of ["web", "worker"]) {
		const service = parsed.services[serviceName];
		if (!isRecord(service) || typeof service.image !== "string" || service.build !== undefined) {
			throw new Error(`Image deployment requires an explicit ${serviceName} image`);
		}
		targets.set(serviceName, targetReference(service.image, serviceName, version));
	}

	const migrationService = parsed.services["db-migrate"];
	let migrationImage: string;
	if (migrationService === undefined) {
		const officialWeb = targets.get("web") === `elmohq/elmo-web:${version}`;
		const officialWorker = targets.get("worker") === `elmohq/elmo-worker:${version}`;
		if (!officialWeb || !officialWorker) {
			throw new Error(
				"Custom image deployments must define an explicit db-migrate image from the same release pipeline",
			);
		}
		migrationImage = `elmohq/elmo-db-migrate:${version}`;
	} else {
		if (
			!isRecord(migrationService) ||
			typeof migrationService.image !== "string" ||
			migrationService.build !== undefined
		) {
			throw new Error("Image deployment requires an explicit db-migrate image");
		}
		migrationImage = targetReference(migrationService.image, "db-migrate", version);
		targets.set("db-migrate", migrationImage);
	}

	const document = parseDocument(contents);
	if (document.errors.length > 0) throw document.errors[0];
	for (const [serviceName, target] of targets) {
		document.setIn(["services", serviceName, "image"], target);
	}
	document.setIn(["services", "web", "stop_grace_period"], "65m");
	document.setIn(["services", "worker", "stop_grace_period"], "65m");
	const composeContents = document.toString();
	const verified: unknown = parse(composeContents);
	if (!isRecord(verified) || !isRecord(verified.services)) {
		throw new Error("Repinned Compose file is invalid");
	}
	for (const [serviceName, target] of targets) {
		const service = verified.services[serviceName];
		if (!isRecord(service) || service.image !== target) {
			throw new Error(`Repinned Compose service ${serviceName} does not reference ${target}`);
		}
	}
	for (const serviceName of ["web", "worker"]) {
		const service = verified.services[serviceName];
		if (!isRecord(service) || service.stop_grace_period !== "65m") {
			throw new Error(`Repinned Compose ${serviceName} does not preserve the one-hour graceful drain contract`);
		}
	}

	return {
		composeContents,
		images: {
			dbMigrate: migrationImage,
			web: targets.get("web") as string,
			worker: targets.get("worker") as string,
		},
	};
}

export function renderedByHeader(version: string): string {
	return [
		`# Rendered by elmo ${version} on ${new Date().toISOString()}`,
		"# Run `elmo upgrade` after upgrading the CLI to refresh this file.",
	].join("\n");
}

// Reads the version recorded in a `# Rendered by elmo <version> on ...` header,
// or null when the file has no such header (e.g. a legacy, pre-header install).
export function parseRenderedVersion(contents: string): string | null {
	const match = contents.match(/^# Rendered by elmo (\S+) on /m);
	return match ? match[1] : null;
}

// Refreshes the `# Rendered by elmo <version> on ...` header, adding one at the
// top if the file doesn't have it yet (e.g. a legacy install rendered before
// the header existed) so future `elmo upgrade` runs can detect the version.
export function refreshHeaderVersion(contents: string, version: string): string {
	if (!/^# Rendered by elmo \S+ on /m.test(contents)) {
		return `${renderedByHeader(version)}\n${contents}`;
	}
	return contents.replace(
		/^# Rendered by elmo \S+ on .*$/m,
		`# Rendered by elmo ${version} on ${new Date().toISOString()}`,
	);
}
