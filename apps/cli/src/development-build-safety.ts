import fs from "node:fs/promises";
import path from "node:path";
import { parse } from "yaml";

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isRemoteContext(context: string): boolean {
	return context === "-" || /^[a-z][a-z0-9+.-]*:\/\//i.test(context) || context.startsWith("service:");
}

function additionalContexts(value: unknown): string[] {
	if (Array.isArray(value)) {
		return value.flatMap((entry) => {
			if (typeof entry !== "string") return [];
			const separator = entry.indexOf("=");
			return separator === -1 ? [] : [entry.slice(separator + 1)];
		});
	}
	if (!isRecord(value)) return [];
	return Object.values(value).filter((entry): entry is string => typeof entry === "string");
}

export function localDevelopmentBuildContexts(composeContents: string, configDir: string): string[] {
	const document: unknown = parse(composeContents);
	if (!isRecord(document) || !isRecord(document.services)) {
		throw new Error("Development compose file does not define services");
	}

	const contexts = new Set<string>();
	for (const service of Object.values(document.services)) {
		if (!isRecord(service) || service.build === undefined) continue;
		const build = service.build;
		const candidates =
			typeof build === "string"
				? [build]
				: isRecord(build)
					? [typeof build.context === "string" ? build.context : ".", ...additionalContexts(build.additional_contexts)]
					: [];
		for (const context of candidates) {
			if (!context || isRemoteContext(context)) continue;
			contexts.add(path.resolve(configDir, context));
		}
	}
	return [...contexts];
}

function containsPath(parent: string, candidate: string): boolean {
	const relative = path.relative(parent, candidate);
	return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative));
}

export async function assertRecoveryStateOutsideDevelopmentBuildContexts(input: {
	composeContents: string;
	configDir: string;
	recoveryPath: string;
}): Promise<void> {
	const recoveryParent = await fs.realpath(path.dirname(input.recoveryPath));
	const canonicalRecoveryPath = path.join(recoveryParent, path.basename(input.recoveryPath));
	for (const context of localDevelopmentBuildContexts(input.composeContents, input.configDir)) {
		const canonicalContext = await fs.realpath(context);
		if (containsPath(canonicalContext, canonicalRecoveryPath)) {
			throw new Error(
				`Refusing development upgrade because private recovery state would enter Docker build context ${canonicalContext}; set an absolute XDG_STATE_HOME outside the source tree`,
			);
		}
	}
}
