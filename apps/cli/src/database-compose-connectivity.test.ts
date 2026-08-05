import { describe, expect, it } from "vitest";
import { databaseUtilityConnectivity } from "./database-compose-connectivity.js";

describe("upgrade database container connectivity", () => {
	it("inherits explicit database networks, DNS, dependencies, and credential mounts", () => {
		expect(
			databaseUtilityConnectivity(`
services:
  db-migrate:
    image: operator/migrator
    networks: [database]
    dns: [10.0.0.2]
    extra_hosts: [private-db:10.0.0.3]
    depends_on:
      postgres:
        condition: service_healthy
    volumes:
      - ./certs:/certs/elmo:ro
    secrets:
      - db_client_key
      - source: db_client_cert
        target: db-client.crt
networks:
  database: {}
secrets:
  db_client_key:
    file: ./client.key
  db_client_cert:
    file: ./client.crt
`),
		).toEqual({
			networks: ["database"],
			dns: ["10.0.0.2"],
			extra_hosts: ["private-db:10.0.0.3"],
			depends_on: { postgres: { condition: "service_healthy" } },
			volumes: ["./certs:/certs/elmo:ro"],
			secrets: ["db_client_key", { source: "db_client_cert", target: "/run/secrets/db-client.crt" }],
		});
	});

	it("falls back to application connectivity for legacy development files", () => {
		expect(
			databaseUtilityConnectivity(`
services:
  web:
    build: .
    network_mode: host
    configs:
      - source: pg_service
        target: /run/configs/pg_service.conf
`),
		).toEqual({
			network_mode: "host",
			configs: [{ source: "pg_service", target: "/run/configs/pg_service.conf" }],
		});
	});

	it("rejects an implicit default network beside explicit database connectivity", () => {
		expect(() =>
			databaseUtilityConnectivity(`
services:
  db-migrate:
    image: operator/migrator
    networks: [database]
  web:
    image: operator/web
  worker:
    image: operator/worker
    networks: [database]
networks:
  database: {}
`),
		).toThrow(/connectivity differs between db-migrate and web/);
	});

	it("accepts the implicit default network only when every database client uses it", () => {
		expect(
			databaseUtilityConnectivity(`
services:
  db-migrate:
    image: operator/migrator
  web:
    image: operator/web
  worker:
    image: operator/worker
`),
		).toEqual({});
	});

	it.each([
		"/run/secrets/../../app/package.json",
		"/etc/ssl/certs/../../../app/src/index.ts",
		"/run/secrets//client.key",
	])("rejects non-canonical credential mount target %s", (target) => {
		expect(() =>
			databaseUtilityConnectivity(`
services:
  worker:
    image: operator/worker
    volumes:
      - type: bind
        source: ./credential
        target: ${target}
        read_only: true
`),
		).toThrow(/worker overrides volumes/);
	});

	it.each([
		["privileged", "true"],
		["user", '"root"'],
		["stop_signal", "SIGKILL"],
		["use_api_socket", "true"],
		["links", "[database:postgres]"],
	])("rejects the %s runtime contract override", (field, value) => {
		expect(() =>
			databaseUtilityConnectivity(`
services:
  worker:
    image: operator/worker
    ${field}: ${value}
`),
		).toThrow(new RegExp(String(field)));
	});

	it("rejects top-level includes before constructing an incomplete utility override", () => {
		expect(() =>
			databaseUtilityConnectivity(`
include:
  - database-connectivity.yaml
services:
  worker:
    image: operator/worker
`),
		).toThrow(/Compose include/);
	});
});
