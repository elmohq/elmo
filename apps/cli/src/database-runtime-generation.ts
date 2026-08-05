import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { parse, stringify } from "yaml";
import { syncDirectory, writeNewTextFileDurably } from "./atomic-file.js";
import { databaseUtilityConnectivity } from "./database-compose-connectivity.js";

export const RUNTIME_GENERATION_SERVICE_NAME = "elmo-upgrade-runtime-generation";

type RunCompose = (args: string[]) => Promise<void>;

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function buildRuntimeGenerationOverride(input: {
	allowMissingTable: boolean;
	composeContents: string;
	expectedGeneration: string;
	generation: string;
	migrationImageId: string;
}): string {
	if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/u.test(input.generation)) {
		throw new Error("Runtime generation is invalid");
	}
	if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/u.test(input.expectedGeneration)) {
		throw new Error("Expected runtime generation is invalid");
	}
	const document: unknown = parse(input.composeContents, { merge: true });
	if (!isRecord(document) || !isRecord(document.services)) throw new Error("Compose file does not define services");
	const service: Record<string, unknown> = {
		...databaseUtilityConnectivity(input.composeContents),
		image: input.migrationImageId,
		pull_policy: "never",
		restart: "no",
		command: ["./node_modules/.bin/tsx", "scripts/set-runtime-generation.ts"],
		environment: {
			DATABASE_URL_UNPOOLED: `\${DATABASE_URL_UNPOOLED:?DATABASE_URL_UNPOOLED is required}`,
			ELMO_RUNTIME_GENERATION_EXPECTED: input.expectedGeneration,
			ELMO_RUNTIME_GENERATION_TARGET: input.generation,
			...(input.allowMissingTable ? { ELMO_RUNTIME_GENERATION_ALLOW_MISSING_TABLE: "1" } : {}),
		},
	};
	if (isRecord(document.services.postgres)) {
		service.depends_on = {
			...(isRecord(service.depends_on) ? service.depends_on : {}),
			postgres: { condition: "service_healthy" },
		};
	}
	return stringify({ services: { [RUNTIME_GENERATION_SERVICE_NAME]: service } });
}

export async function setDatabaseRuntimeGeneration(input: {
	allowMissingTable?: boolean;
	configDir: string;
	expectedGeneration: string;
	generation: string;
	migrationImageId: string;
	runCompose: RunCompose;
}): Promise<void> {
	const composeContents = await fs.readFile(path.join(input.configDir, "elmo.yaml"), "utf8");
	const overridePath = path.join(input.configDir, `.elmo-upgrade-runtime-generation-${crypto.randomUUID()}.yaml`);
	await writeNewTextFileDurably(
		overridePath,
		buildRuntimeGenerationOverride({
			allowMissingTable: input.allowMissingTable ?? false,
			composeContents,
			expectedGeneration: input.expectedGeneration,
			generation: input.generation,
			migrationImageId: input.migrationImageId,
		}),
		0o600,
	);
	try {
		await input.runCompose([
			"-f",
			overridePath,
			"run",
			"--rm",
			"--pull",
			"never",
			"--no-TTY",
			RUNTIME_GENERATION_SERVICE_NAME,
		]);
	} finally {
		await fs.rm(overridePath, { force: true });
		await syncDirectory(input.configDir);
	}
}
