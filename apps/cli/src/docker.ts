import { type SpawnSyncReturns, spawnSync } from "node:child_process";

export type DockerCheckResult = Pick<SpawnSyncReturns<unknown>, "error" | "status">;

const NOT_INSTALLED =
	"Docker does not appear to be installed. Install Docker Desktop or Docker Engine and try again: https://docs.docker.com/get-docker/";
const NOT_RUNNING = "Docker does not appear to be running. Start Docker and try again.";

/**
 * A missing `docker` binary and a stopped daemon need different fixes, so they
 * get different messages: spawn fails with ENOENT when nothing is on PATH,
 * while an installed CLI reaches `docker info` and exits non-zero.
 */
export function dockerFailureMessage(result: DockerCheckResult): string | undefined {
	const code = (result.error as NodeJS.ErrnoException | undefined)?.code;
	if (code === "ENOENT") return NOT_INSTALLED;
	if (result.error) return `Could not run Docker: ${result.error.message}`;
	if (result.status !== 0) return NOT_RUNNING;
	return undefined;
}

export function assertDockerRunning(): void {
	const message = dockerFailureMessage(spawnSync("docker", ["info"], { stdio: "ignore" }));
	if (message) {
		throw new Error(message);
	}
}
