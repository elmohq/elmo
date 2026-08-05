import semver from "semver";

export const MINIMUM_DOCKER_COMPOSE_VERSION = "2.24.0";

export function assertSupportedDockerComposeVersion(output: string): string {
	const version = semver.coerce(output)?.version;
	if (!version || semver.lt(version, MINIMUM_DOCKER_COMPOSE_VERSION)) {
		throw new Error(
			`Docker Compose ${MINIMUM_DOCKER_COMPOSE_VERSION} or newer is required for safe Elmo deployments; update Docker Compose before continuing`,
		);
	}
	return version;
}
