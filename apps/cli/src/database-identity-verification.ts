import { randomBytes, randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import {
	assertDirectPostgreSqlConnectionString,
	parsePostgreSqlConnectionTarget,
} from "@workspace/config/database-url";
import { parse as parseDotenv } from "dotenv";
import { parse, stringify } from "yaml";
import { syncDirectory, writeNewTextFileDurably } from "./atomic-file.js";
import { databaseUtilityConnectivity } from "./database-compose-connectivity.js";

export const DATABASE_IDENTITY_VERIFIER_SERVICE = "elmo-upgrade-database-identity";

type RunCompose = (args: string[]) => Promise<void>;

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function randomizedDatabaseIdentityLockId(): string {
	const bytes = randomBytes(8);
	bytes[0] &= 0x3f;
	return bytes.readBigUInt64BE().toString();
}

export function assertSessionAffineDatabaseUrl(
	databaseUrl: string | undefined,
	variableName = "DATABASE_URL_UNPOOLED",
): void {
	assertDirectPostgreSqlConnectionString(databaseUrl, variableName);
}

export function isCliManagedLocalPostgresDatabaseUrl(databaseUrl: string | undefined): boolean {
	try {
		const target = parsePostgreSqlConnectionTarget(databaseUrl);
		assertSessionAffineDatabaseUrl(databaseUrl, "DATABASE_URL");
		return target.host.toLowerCase() === "postgres" && target.port === "5432";
	} catch {
		return false;
	}
}

export function buildDatabaseIdentityVerificationOverride(input: {
	composeContents: string;
	lockId: string;
	migrationImageId: string;
}): string {
	const document: unknown = parse(input.composeContents);
	if (!isRecord(document) || !isRecord(document.services)) {
		throw new Error("Compose file does not define services");
	}
	const service: Record<string, unknown> = {
		...databaseUtilityConnectivity(input.composeContents),
		image: input.migrationImageId,
		pull_policy: "never",
		restart: "no",
		command: ["./node_modules/.bin/tsx", "scripts/verify-database-identity.ts"],
		environment: {
			DATABASE_URL: `\${DATABASE_URL:?DATABASE_URL is required}`,
			DATABASE_URL_UNPOOLED: `\${DATABASE_URL_UNPOOLED:?DATABASE_URL_UNPOOLED is required}`,
			ELMO_DATABASE_IDENTITY_LOCK_ID: input.lockId,
		},
	};
	if (isRecord(document.services.postgres)) {
		service.depends_on = {
			...(isRecord(service.depends_on) ? service.depends_on : {}),
			postgres: { condition: "service_healthy" },
		};
	}
	return stringify({ services: { [DATABASE_IDENTITY_VERIFIER_SERVICE]: service } });
}

export async function verifyDatabaseConnectionIdentity(input: {
	configDir: string;
	migrationImageId: string;
	runCompose: RunCompose;
	lockId?: string;
}): Promise<void> {
	const env = parseDotenv(await fs.readFile(path.join(input.configDir, ".env"), "utf8"));
	assertSessionAffineDatabaseUrl(env.DATABASE_URL_UNPOOLED);
	const lockId = input.lockId ?? randomizedDatabaseIdentityLockId();
	if (!/^(0|[1-9][0-9]{0,18})$/u.test(lockId) || BigInt(lockId) > 4_611_686_018_427_387_903n) {
		throw new Error("Database identity challenge lock ID is invalid");
	}
	const composeContents = await fs.readFile(path.join(input.configDir, "elmo.yaml"), "utf8");
	const overridePath = path.join(input.configDir, `.elmo-upgrade-database-identity-${randomUUID()}.yaml`);
	await writeNewTextFileDurably(
		overridePath,
		buildDatabaseIdentityVerificationOverride({
			composeContents,
			lockId,
			migrationImageId: input.migrationImageId,
		}),
		0o600,
	);
	try {
		await input.runCompose(["-f", overridePath, "run", "--rm", "--no-TTY", DATABASE_IDENTITY_VERIFIER_SERVICE]);
	} catch (error) {
		throw new Error(
			"Could not prove DATABASE_URL and DATABASE_URL_UNPOOLED identify the same database through a session-affine direct connection",
			{ cause: error },
		);
	} finally {
		await fs.rm(overridePath, { force: true });
		await syncDirectory(input.configDir);
	}
}
