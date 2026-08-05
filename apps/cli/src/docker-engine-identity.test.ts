import { describe, expect, it, vi } from "vitest";
import { assertSameDockerEngineIdentity, captureDockerEngineIdentity } from "./docker-engine-identity.js";

describe("Docker engine recovery identity", () => {
	it("records the daemon, selected context, and resolved endpoint", async () => {
		const capture = vi.fn(async (args: string[]) => {
			if (args[0] === "info") return "daemon-a\n";
			if (args[1] === "show") return "production\n";
			return "ssh://operator@host-a\n";
		});
		const captureCompose = vi.fn(async () => JSON.stringify({ name: "elmo-production" }));

		await expect(captureDockerEngineIdentity(capture, captureCompose, {})).resolves.toEqual({
			daemonId: "daemon-a",
			context: "production",
			endpoint: "ssh://operator@host-a",
			composeProject: "elmo-production",
		});
	});

	it("honors an explicit Docker context over a Docker host override", async () => {
		const capture = vi.fn(async (args: string[]) => {
			if (args[0] === "info") return "daemon-a\n";
			if (args[1] === "show") return "ignored-by-host\n";
			return "ssh://ignored-by-context\n";
		});
		const captureCompose = vi.fn(async () => JSON.stringify({ name: "elmo" }));

		await expect(
			captureDockerEngineIdentity(capture, captureCompose, {
				DOCKER_CONTEXT: "ignored-by-host",
				DOCKER_HOST: "tcp://engine.internal:2376",
			}),
		).resolves.toEqual({
			daemonId: "daemon-a",
			context: "ignored-by-host",
			endpoint: "ssh://ignored-by-context",
			composeProject: "elmo",
		});
	});

	it("refuses to resume on a different daemon even when the endpoint text matches", () => {
		expect(() =>
			assertSameDockerEngineIdentity(
				{
					daemonId: "daemon-a",
					context: "production",
					endpoint: "unix:///var/run/docker.sock",
					composeProject: "elmo",
				},
				{
					daemonId: "daemon-b",
					context: "production",
					endpoint: "unix:///var/run/docker.sock",
					composeProject: "elmo",
				},
			),
		).toThrow(/switch back before resuming/);
	});

	it("refuses to resume against another Compose project on the same daemon", () => {
		const expected = {
			daemonId: "daemon-a",
			context: "production",
			endpoint: "ssh://operator@host-a",
			composeProject: "elmo-a",
		};
		expect(() => assertSameDockerEngineIdentity(expected, { ...expected, composeProject: "elmo-b" })).toThrow(
			/composeProject/,
		);
	});
});
