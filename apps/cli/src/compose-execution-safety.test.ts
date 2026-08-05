import { describe, expect, it } from "vitest";
import { assertSchemaBoundaryExecutionConfig } from "./compose-execution-safety.js";

describe("schema-boundary Compose execution safety", () => {
	it("accepts generated-style services that execute the image contract", () => {
		expect(() =>
			assertSchemaBoundaryExecutionConfig(`services:
  web:
    image: elmohq/elmo-web:1.2.3
    env_file: [.env]
    ports: ["3000:3000"]
  worker:
    image: elmohq/elmo-worker:1.2.3
    env_file: [.env]
    stop_grace_period: 65m
  db-migrate:
    image: elmohq/elmo-db-migrate:1.2.3
`),
		).not.toThrow();
	});

	it.each([
		["web", "volumes", '["./old-build:/app"]'],
		["worker", "tmpfs", '["/tmp"]'],
		["worker", "command", '["node", "old-worker.js"]'],
		["web", "healthcheck", '{ test: ["CMD", "true"] }'],
		["db-migrate", "entrypoint", '["sh", "-c"]'],
	])("rejects %s %s overrides even when the image itself can be labeled", (service, field, value) => {
		const services = ["web", "worker", "db-migrate"]
			.map((name) => `  ${name}:\n    image: custom/${name}:1.2.3${name === service ? `\n    ${field}: ${value}` : ""}`)
			.join("\n");
		expect(() => assertSchemaBoundaryExecutionConfig(`services:\n${services}\n`)).toThrow(new RegExp(String(field)));
	});

	it("resolves YAML merge keys before checking execution overrides", () => {
		expect(() =>
			assertSchemaBoundaryExecutionConfig(`x-old-runtime: &old-runtime
  volumes: ["./old-build:/app"]
services:
  web:
    <<: *old-runtime
    image: elmohq/elmo-web:1.2.3
  worker:
    image: elmohq/elmo-worker:1.2.3
`),
		).toThrow(/volumes/);
	});

	it("rejects rendered services whose effective database or fence environment diverges", () => {
		const rendered = JSON.stringify({
			services: {
				web: {
					environment: {
						DATABASE_URL: "postgres://application/db",
						DATABASE_URL_UNPOOLED: "postgres://wrong/db",
					},
				},
				worker: {
					environment: {
						DATABASE_URL: "postgres://application/db",
						DATABASE_URL_UNPOOLED: "postgres://direct/db",
					},
				},
			},
		});
		expect(() =>
			assertSchemaBoundaryExecutionConfig(rendered, {
				databaseUrl: "postgres://application/db",
				unpooledDatabaseUrl: "postgres://direct/db",
				runtimeFenceGeneration: "0020",
			}),
		).toThrow(/web does not use the deployment's DATABASE_URL/);
	});

	it.each([
		["NODE_OPTIONS", "--import=data:text/javascript,throw%20new%20Error()"],
		["PATH", "/run/secrets"],
		["LD_AUDIT", "/run/secrets/audit.so"],
		["DYLD_INSERT_LIBRARIES", "/run/secrets/hook.dylib"],
		["OPENSSL_CONF", "/run/configs/openssl.cnf"],
		["PGHOST", "different-database"],
	])("rejects rendered %s environment overrides", (name, value) => {
		expect(() =>
			assertSchemaBoundaryExecutionConfig(
				JSON.stringify({
					services: {
						web: { environment: { [name]: value } },
						worker: { environment: {} },
					},
				}),
			),
		).toThrow(new RegExp(String(name)));
	});

	it("rejects a bare inherited dangerous environment key", () => {
		expect(() =>
			assertSchemaBoundaryExecutionConfig(`services:
  web:
    image: elmohq/elmo-web:1.2.3
    environment: [NODE_OPTIONS]
  worker:
    image: elmohq/elmo-worker:1.2.3
`),
		).toThrow(/NODE_OPTIONS/);
	});
});
