import { describe, expect, it, vi } from "vitest";
import { resolveDevelopmentBackupImageId } from "./development-image-backup.js";

describe("development image rollback source", () => {
	it("backs up the exact running image when the configured tag has drifted", async () => {
		const capture = vi.fn(async (args: string[]) => {
			if (args[0] === "container") return "sha256:aaaaaaaa\n";
			return "sha256:bbbbbbbb\n";
		});

		await expect(
			resolveDevelopmentBackupImageId({
				service: "web",
				configuredReference: "elmo-web",
				containers: [{ ID: "container-web", Service: "web", State: "running" }],
				capture,
			}),
		).resolves.toBe("sha256:aaaaaaaa");
		expect(capture).toHaveBeenCalledOnce();
		expect(capture).toHaveBeenCalledWith(["container", "inspect", "--format", "{{.Image}}", "container-web"]);
	});

	it("fails closed when running replicas do not share an image", async () => {
		const capture = vi
			.fn<(args: string[]) => Promise<string>>()
			.mockResolvedValueOnce("sha256:aaaaaaaa")
			.mockResolvedValueOnce("sha256:bbbbbbbb");
		await expect(
			resolveDevelopmentBackupImageId({
				service: "worker",
				configuredReference: "elmo-worker",
				containers: [
					{ ID: "worker-1", Service: "worker", State: "running" },
					{ ID: "worker-2", Service: "worker", State: "restarting" },
				],
				capture,
			}),
		).rejects.toThrow(/replicas use different images/);
	});

	it("uses the configured image only for a truly stopped service", async () => {
		const capture = vi.fn(async () => "sha256:cccccccc");
		await expect(
			resolveDevelopmentBackupImageId({
				service: "worker",
				configuredReference: "elmo-worker",
				containers: [{ ID: "old-worker", Service: "worker", State: "exited" }],
				capture,
			}),
		).resolves.toBe("sha256:cccccccc");
		expect(capture).toHaveBeenCalledWith(["image", "inspect", "--format", "{{.Id}}", "elmo-worker"]);
	});
});
