export interface DockerEngineIdentity {
	daemonId: string;
	context: string;
	endpoint: string;
	composeProject: string;
}

type CaptureDocker = (args: string[]) => Promise<string>;

function requiredValue(value: string, label: string): string {
	const normalized = value.trim();
	if (!normalized) throw new Error(`Docker did not report its ${label}`);
	return normalized;
}

export async function captureDockerEngineIdentity(
	capture: CaptureDocker,
	captureCompose: CaptureDocker,
	environment: NodeJS.ProcessEnv = process.env,
): Promise<DockerEngineIdentity> {
	const daemonId = requiredValue(await capture(["info", "--format", "{{.ID}}"]), "daemon ID");
	const context = requiredValue(await capture(["context", "show"]), "effective context");
	const endpoint = requiredValue(
		(environment.DOCKER_CONTEXT ? undefined : environment.DOCKER_HOST) ??
			(await capture(["context", "inspect", context, "--format", "{{.Endpoints.docker.Host}}"])),
		"effective endpoint",
	);
	const composeConfig: unknown = JSON.parse(await captureCompose(["config", "--format", "json"]));
	const composeProject =
		typeof composeConfig === "object" && composeConfig !== null && "name" in composeConfig
			? requiredValue(String(composeConfig.name), "Compose project name")
			: requiredValue("", "Compose project name");
	return { daemonId, context, endpoint, composeProject };
}

export function assertSameDockerEngineIdentity(expected: DockerEngineIdentity, observed: DockerEngineIdentity): void {
	for (const field of ["daemonId", "context", "endpoint", "composeProject"] as const) {
		if (expected[field] !== observed[field]) {
			throw new Error(
				`Upgrade recovery belongs to Docker ${field} ${expected[field]}, not ${observed[field]}; switch back before resuming`,
			);
		}
	}
}
