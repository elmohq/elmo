import { describe, expect, it, vi } from "vitest";
import {
	assertComposeServiceImageIds,
	attestRollbackSchemaCompatibility,
	CLOUD_SCHEMA_COMPATIBILITY,
	captureRollbackRuntimeImages,
	RELEASE_VERSION_LABEL,
	ROLLBACK_SCHEMA_COMPATIBILITY_LABEL,
	RUNTIME_FENCE_GENERATION_LABEL,
	requireSchemaCompatibleImages,
	requiresHardRecoveryGuidance,
	requiresTargetRecoveryFence,
	restoreRollbackRuntimeImages,
} from "./rollback-compatibility.js";

const CONTAINER_PATH = "/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin";

function imageConfig(service: "web" | "worker" | "dbMigrate", generation = CLOUD_SCHEMA_COMPATIBILITY) {
	if (service === "web") {
		return {
			Cmd: ["node", ".output/server/index.mjs"],
			Entrypoint: ["/entrypoint.sh"],
			Env: [
				`PATH=${CONTAINER_PATH}`,
				"NODE_VERSION=24.11.1",
				"YARN_VERSION=1.22.22",
				"NODE_ENV=production",
				`ELMO_RUNTIME_FENCE_GENERATION=${generation}`,
				"SERVER_SHUTDOWN_TIMEOUT=3600",
				"PORT=3000",
				"HOST=0.0.0.0",
			],
			Healthcheck: {
				Interval: 5_000_000_000,
				Retries: 30,
				StartPeriod: 30_000_000_000,
				Test: [
					"CMD-SHELL",
					`curl --fail --silent http://127.0.0.1:3000/api/setup-status | grep --quiet '"ready":true'`,
				],
				Timeout: 5_000_000_000,
			},
			User: "elmo",
			WorkingDir: "/app",
		};
	}
	if (service === "worker") {
		return {
			Cmd: ["./node_modules/.bin/tsx", "src/index.ts"],
			Entrypoint: ["/entrypoint.sh"],
			Env: [
				`PATH=${CONTAINER_PATH}`,
				"NODE_VERSION=24.11.1",
				"YARN_VERSION=1.22.22",
				"NODE_ENV=production",
				`ELMO_RUNTIME_FENCE_GENERATION=${generation}`,
			],
			Healthcheck: {
				Interval: 5_000_000_000,
				Retries: 30,
				StartPeriod: 30_000_000_000,
				Test: ["CMD-SHELL", "test -f /tmp/elmo-worker-ready && kill -0 1"],
				Timeout: 5_000_000_000,
			},
			User: "worker",
			WorkingDir: "/app",
		};
	}
	return {
		Cmd: ["./node_modules/.bin/tsx", "scripts/migrate.ts"],
		Entrypoint: ["docker-entrypoint.sh"],
		Env: [`PATH=${CONTAINER_PATH}`, "NODE_VERSION=24.11.1", "YARN_VERSION=1.22.22"],
		Healthcheck: null,
		User: "",
		WorkingDir: "/app",
	};
}

function imageLabels(release = "1.2.3", generation = CLOUD_SCHEMA_COMPATIBILITY) {
	return {
		[ROLLBACK_SCHEMA_COMPATIBILITY_LABEL]: CLOUD_SCHEMA_COMPATIBILITY,
		[RELEASE_VERSION_LABEL]: release,
		[RUNTIME_FENCE_GENERATION_LABEL]: generation,
	};
}

describe("rollback schema compatibility attestation", () => {
	it("keeps hard recovery guidance after any rollback failure beyond the schema boundary", () => {
		expect(
			requiresHardRecoveryGuidance({
				crossesSchemaBoundary: true,
				databaseBoundaryMayHaveAdvanced: true,
				targetRecoveryFenceRequired: false,
				rollbackCause: new Error("compatibility container failed health check"),
			}),
		).toBe(true);
	});

	it("requires every prepared runtime and migrator image to carry the schema contract", async () => {
		const servicesByImageId = new Map<string, "web" | "worker" | "dbMigrate">();
		const capture = vi.fn(async (args: string[]) => {
			if (args.includes("{{.Id}}")) {
				const reference = String(args.at(-1));
				const service = reference.includes("worker") ? "worker" : reference.includes("migrate") ? "dbMigrate" : "web";
				const imageId = service === "worker" ? "sha256:bbbb" : service === "dbMigrate" ? "sha256:cccc" : "sha256:aaaa";
				servicesByImageId.set(imageId, service);
				return imageId;
			}
			if (args.includes("{{json .Config.Labels}}")) return JSON.stringify(imageLabels());
			const service = servicesByImageId.get(String(args.at(-1)));
			if (!service) throw new Error(`Unknown image: ${String(args.at(-1))}`);
			return JSON.stringify(imageConfig(service));
		});
		await expect(
			requireSchemaCompatibleImages({
				images: { web: "repo/web:target", worker: "repo/worker:target", dbMigrate: "repo/migrate:target" },
				expectedReleaseVersion: "1.2.3",
				expectedRuntimeFenceGeneration: CLOUD_SCHEMA_COMPATIBILITY,
				capture,
			}),
		).resolves.toMatchObject({ web: expect.stringMatching(/^sha256:/), worker: expect.stringMatching(/^sha256:/) });

		capture.mockImplementation(async (args: string[]) => {
			if (args.includes("{{.Id}}")) return "sha256:abc";
			return "null";
		});
		await expect(
			requireSchemaCompatibleImages({
				images: { worker: "repo/worker:stale" },
				expectedReleaseVersion: "1.2.3",
				expectedRuntimeFenceGeneration: CLOUD_SCHEMA_COMPATIBILITY,
				capture,
			}),
		).rejects.toThrow(/does not attest schema compatibility 0020/);
	});

	it("distinguishes the target release from a schema-safe rollback image", async () => {
		const capture = vi.fn(async (args: string[]) => {
			if (args.includes("{{.Id}}")) return "sha256:abc";
			return JSON.stringify({
				[ROLLBACK_SCHEMA_COMPATIBILITY_LABEL]: CLOUD_SCHEMA_COMPATIBILITY,
				[RELEASE_VERSION_LABEL]: "0.2.17-white-label-compat",
			});
		});

		await expect(
			requireSchemaCompatibleImages({
				images: { web: "repo/web:wrong-release" },
				expectedReleaseVersion: "0.2.18",
				expectedRuntimeFenceGeneration: CLOUD_SCHEMA_COMPATIBILITY,
				capture,
			}),
		).rejects.toThrow(/is not release 0.2.18/);
	});

	it.each([
		["command", { ...imageConfig("web"), Cmd: ["sh", "-c", "node .output/server/index.mjs"] }],
		["user", { ...imageConfig("web"), User: "root" }],
		["stop signal", { ...imageConfig("web"), StopSignal: "SIGKILL" }],
		["shell", { ...imageConfig("web"), Shell: ["sh", "-c"] }],
		["volume", { ...imageConfig("web"), Volumes: { "/app": {} } }],
		[
			"environment",
			{
				...imageConfig("web"),
				Env: [...imageConfig("web").Env, "NODE_OPTIONS=--require=/tmp/untrusted.cjs"],
			},
		],
	])("rejects an image with an untrusted %s contract", async (_name, config) => {
		const capture = vi.fn(async (args: string[]) => {
			if (args.includes("{{.Id}}")) return "sha256:aaaa";
			if (args.includes("{{json .Config.Labels}}")) return JSON.stringify(imageLabels());
			return JSON.stringify(config);
		});

		await expect(
			requireSchemaCompatibleImages({
				images: { web: "repo/web:untrusted" },
				expectedReleaseVersion: "1.2.3",
				expectedRuntimeFenceGeneration: CLOUD_SCHEMA_COMPATIBILITY,
				capture,
			}),
		).rejects.toThrow(/does not match the trusted execution contract/);
	});

	it.each(["web", "worker"] as const)("rejects a fake %s healthcheck that only mentions readiness", async (service) => {
		const config = imageConfig(service);
		config.Healthcheck = {
			Interval: 5_000_000_000,
			Retries: 30,
			StartPeriod: 30_000_000_000,
			Test: [
				"CMD-SHELL",
				service === "web" ? `true # /api/setup-status "ready":true` : "true # /tmp/elmo-worker-ready kill -0 1",
			],
			Timeout: 5_000_000_000,
		};
		const capture = vi.fn(async (args: string[]) => {
			if (args.includes("{{.Id}}")) return "sha256:aaaa";
			if (args.includes("{{json .Config.Labels}}")) return JSON.stringify(imageLabels());
			return JSON.stringify(config);
		});

		const requirement =
			service === "web"
				? requireSchemaCompatibleImages({
						images: { web: "repo/web:fake-health" },
						expectedReleaseVersion: "1.2.3",
						expectedRuntimeFenceGeneration: CLOUD_SCHEMA_COMPATIBILITY,
						capture,
					})
				: requireSchemaCompatibleImages({
						images: { worker: "repo/worker:fake-health" },
						expectedReleaseVersion: "1.2.3",
						expectedRuntimeFenceGeneration: CLOUD_SCHEMA_COMPATIBILITY,
						capture,
					});
		await expect(requirement).rejects.toThrow(/does not match the trusted execution contract/);
	});

	it("keeps the target recovery fence even when the old stack was intentionally stopped", () => {
		expect(
			requiresTargetRecoveryFence({
				crossesSchemaBoundary: true,
				databaseBoundaryMayHaveAdvanced: true,
				rollbackSchemaCompatibility: null,
				rollbackImageIdsAvailable: false,
			}),
		).toBe(true);
		expect(
			requiresTargetRecoveryFence({
				crossesSchemaBoundary: true,
				databaseBoundaryMayHaveAdvanced: true,
				rollbackSchemaCompatibility: CLOUD_SCHEMA_COMPATIBILITY,
				rollbackImageIdsAvailable: true,
			}),
		).toBe(false);
	});

	it("accepts only labels from the exact running images", async () => {
		const capture = vi.fn(async (args: string[]) => {
			if (args[0] === "container") return args.at(-1) === "web-1" ? "sha256:aaaa" : "sha256:bbbb";
			if (args.includes("{{json .Config.Labels}}")) return JSON.stringify(imageLabels());
			return JSON.stringify(imageConfig(args.at(-1) === "sha256:bbbb" ? "worker" : "web"));
		});
		await expect(
			attestRollbackSchemaCompatibility({
				servicesToRestart: ["web", "worker"],
				containers: [
					{ ID: "web-1", Service: "web", State: "running" },
					{ ID: "worker-1", Service: "worker", State: "restarting" },
				],
				capture,
			}),
		).resolves.toBe(CLOUD_SCHEMA_COMPATIBILITY);
	});

	it("rejects a runtime assembled from different fence generations", async () => {
		const capture = vi.fn(async (args: string[]) => {
			if (args[0] === "container") return args.at(-1) === "web-1" ? "sha256:aaaa" : "sha256:bbbb";
			const isWorker = args.at(-1) === "sha256:bbbb";
			const generation = isWorker ? "pre-0020" : CLOUD_SCHEMA_COMPATIBILITY;
			if (args.includes("{{json .Config.Labels}}")) return JSON.stringify(imageLabels("1.2.3", generation));
			return JSON.stringify(imageConfig(isWorker ? "worker" : "web", generation));
		});

		await expect(
			attestRollbackSchemaCompatibility({
				servicesToRestart: ["web", "worker"],
				containers: [
					{ ID: "web-1", Service: "web", State: "running" },
					{ ID: "worker-1", Service: "worker", State: "running" },
				],
				capture,
			}),
		).resolves.toBeNull();
	});

	it("rejects a missing label even when the mutable configured tag is compatible", async () => {
		const capture = vi
			.fn<(args: string[]) => Promise<string>>()
			.mockResolvedValueOnce("sha256:aaaa")
			.mockResolvedValueOnce("null");
		await expect(
			attestRollbackSchemaCompatibility({
				servicesToRestart: ["web"],
				containers: [{ ID: "web-1", Service: "web", State: "running" }],
				capture,
			}),
		).resolves.toBeNull();
	});

	it("rejects partial runtime attestation when a stopped app could start later", async () => {
		const capture = vi.fn(async (args: string[]) => {
			if (args[0] === "container") return "sha256:aaaa";
			if (args.includes("{{json .Config.Labels}}")) return JSON.stringify(imageLabels());
			return JSON.stringify(imageConfig("web"));
		});

		await expect(
			attestRollbackSchemaCompatibility({
				servicesToRestart: ["web", "worker"],
				containers: [{ ID: "web-1", Service: "web", State: "running" }],
				capture,
			}),
		).resolves.toBeNull();
	});

	it("rejects mixed live and stopped replicas", async () => {
		await expect(
			attestRollbackSchemaCompatibility({
				servicesToRestart: ["worker"],
				containers: [
					{ ID: "worker-live", Service: "worker", State: "running" },
					{ ID: "worker-stopped", Service: "worker", State: "exited" },
				],
				capture: vi.fn(async () => {
					throw new Error("stopped replicas must fail before image inspection");
				}),
			}),
		).resolves.toBeNull();
	});

	it("requires the exact prepared image ID from every target replica", async () => {
		const capture = vi.fn(async (args: string[]) => {
			if (args.includes("{{.Image}}")) return "sha256:dddd";
			return JSON.stringify({
				[ROLLBACK_SCHEMA_COMPATIBILITY_LABEL]: CLOUD_SCHEMA_COMPATIBILITY,
				[RELEASE_VERSION_LABEL]: "1.2.3",
			});
		});
		await expect(
			attestRollbackSchemaCompatibility({
				servicesToRestart: ["web"],
				containers: [{ ID: "web-1", Service: "web", State: "running" }],
				expectedImageIds: { web: "sha256:prepared" },
				expectedReleaseVersion: "1.2.3",
				capture,
			}),
		).resolves.toBeNull();
	});

	it("checkpoints exact images for live and stopped application containers", async () => {
		const capture = vi.fn(async (args: string[]) => {
			if (args[0] === "container") return args.at(-1) === "web-1" ? "sha256:aaaa" : "sha256:bbbb";
			if (args.includes("{{json .Config.Labels}}")) return "{}";
			if (args.at(-1) === "repo/web:old") return "sha256:aaaa";
			if (args.at(-1) === "repo/worker:old") return "sha256:bbbb";
			throw new Error(`Unexpected capture: ${args.join(" ")}`);
		});

		await expect(
			captureRollbackRuntimeImages({
				services: ["web", "worker"],
				containers: [
					{ ID: "web-1", Service: "web", State: "running" },
					{ ID: "worker-1", Service: "worker", State: "exited" },
				],
				configuredImages: { web: "repo/web:old", worker: "repo/worker:old" },
				capture,
			}),
		).resolves.toEqual([
			{ service: "web", imageId: "sha256:aaaa", reference: "repo/web:old" },
			{ service: "worker", imageId: "sha256:bbbb", reference: "repo/worker:old" },
		]);
	});

	it("refuses rollback when a configured tag no longer names the running bytes", async () => {
		await expect(
			captureRollbackRuntimeImages({
				services: ["web"],
				containers: [{ ID: "web-1", Service: "web", State: "running" }],
				configuredImages: { web: "repo/web:mutable" },
				capture: vi.fn(async (args: string[]) => (args[0] === "container" ? "sha256:aaaa" : "sha256:bbbb")),
			}),
		).rejects.toThrow(/does not match configured image/);
	});

	it("restores exact image references and verifies recreated stopped containers", async () => {
		const run = vi.fn(async () => undefined);
		const capture = vi.fn(async (args: string[]) => {
			if (args[0] === "container") return "sha256:aaaa";
			return "sha256:aaaa";
		});
		const images = [{ service: "web" as const, imageId: "sha256:aaaa", reference: "repo/web:old" }];

		await restoreRollbackRuntimeImages({ images, capture, run });
		await assertComposeServiceImageIds({
			images,
			containers: [{ ID: "web-stopped", Service: "web", State: "created" }],
			capture,
		});

		expect(run).toHaveBeenCalledWith(["image", "tag", "sha256:aaaa", "repo/web:old"]);
	});
});
