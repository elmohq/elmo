import { describe, expect, it } from "vitest";
import { buildComposeYaml } from "./compose-builder";

const baseOptions = {
	dev: false,
	repoRoot: "/repo",
	port: 1515,
	version: "1.2.3",
} as const;

describe("compose database migration wiring", () => {
	it("runs the one-shot migrator against the configured external DATABASE_URL", () => {
		const yaml = buildComposeYaml({ ...baseOptions, postgresMode: "external" });

		expect(yaml).toContain("  db-migrate:\n    image: elmohq/elmo-db-migrate:1.2.3");
		expect(yaml).toContain('    DATABASE_URL: "${DATABASE_URL:?DATABASE_URL is required}"');
		expect(yaml).not.toContain("  postgres:\n");
		expect(yaml).not.toContain("DATABASE_URL=");
		expect(yaml.match(/condition: service_completed_successfully/g)).toHaveLength(2);
	});

	it("preserves the managed Postgres health dependency without hardcoding migration credentials", () => {
		const yaml = buildComposeYaml({ ...baseOptions, postgresMode: "docker" });

		expect(yaml).toContain("  postgres:\n    image: postgres:16-alpine");
		expect(yaml).toContain('    DATABASE_URL: "${DATABASE_URL:?DATABASE_URL is required}"');
		expect(yaml).toContain("    depends_on:\n      postgres:\n        condition: service_healthy");
		expect(yaml).not.toContain("DATABASE_URL=");
		expect(yaml).toContain("volumes:\n  postgres_data:");
	});

	it("gives external development deployments the same migration build target", () => {
		const yaml = buildComposeYaml({ ...baseOptions, dev: true, postgresMode: "external" });

		expect(yaml).toContain(
			"  db-migrate:\n    build:\n      context: /repo\n      dockerfile: docker/Dockerfile\n      target: migrate",
		);
		expect(yaml).not.toContain("  postgres:\n");
	});
});
