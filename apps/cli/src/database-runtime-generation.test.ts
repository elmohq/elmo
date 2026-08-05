import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import { buildRuntimeGenerationOverride, RUNTIME_GENERATION_SERVICE_NAME } from "./database-runtime-generation";

describe("database runtime generation transition", () => {
	it("uses the exact prepared migrator and the unpooled connection", () => {
		const imageId = `sha256:${"a".repeat(64)}`;
		const document = parse(
			buildRuntimeGenerationOverride({
				allowMissingTable: true,
				composeContents: "services:\n  db-migrate:\n    image: old\n",
				expectedGeneration: "0020",
				generation: "pre-0020",
				migrationImageId: imageId,
			}),
		) as { services: Record<string, Record<string, unknown>> };
		expect(document.services[RUNTIME_GENERATION_SERVICE_NAME]).toMatchObject({
			image: imageId,
			pull_policy: "never",
			command: ["./node_modules/.bin/tsx", "scripts/set-runtime-generation.ts"],
			environment: {
				DATABASE_URL_UNPOOLED: `\${DATABASE_URL_UNPOOLED:?DATABASE_URL_UNPOOLED is required}`,
				ELMO_RUNTIME_GENERATION_EXPECTED: "0020",
				ELMO_RUNTIME_GENERATION_TARGET: "pre-0020",
				ELMO_RUNTIME_GENERATION_ALLOW_MISSING_TABLE: "1",
			},
		});
	});
});
