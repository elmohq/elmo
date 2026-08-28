import { describe, expect, it } from "vitest";
import { dockerFailureMessage } from "./docker.js";

function enoent(): NodeJS.ErrnoException {
	const error = new Error("spawnSync docker ENOENT") as NodeJS.ErrnoException;
	error.code = "ENOENT";
	return error;
}

describe("dockerFailureMessage", () => {
	it("accepts a reachable daemon", () => {
		expect(dockerFailureMessage({ status: 0, error: undefined })).toBeUndefined();
	});

	it("points at installing Docker when the binary is missing", () => {
		const message = dockerFailureMessage({ status: null, error: enoent() });

		expect(message).toMatch(/installed/);
		expect(message).toContain("https://docs.docker.com/get-docker/");
	});

	it("points at starting Docker when the CLI runs but the daemon is down", () => {
		const message = dockerFailureMessage({ status: 1, error: undefined });

		expect(message).toMatch(/running/);
		expect(message).not.toMatch(/installed/);
	});

	it("surfaces other spawn failures rather than blaming the daemon", () => {
		const error = new Error("spawnSync docker EACCES") as NodeJS.ErrnoException;
		error.code = "EACCES";

		expect(dockerFailureMessage({ status: null, error })).toContain("EACCES");
	});
});
