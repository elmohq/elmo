export interface DevelopmentComposeContainer {
	ID?: string;
	Name?: string;
	Service: string;
	State: string;
}

type CaptureDocker = (args: string[]) => Promise<string>;

function isLive(state: string): boolean {
	const normalized = state.trim().toLowerCase();
	return normalized.startsWith("running") || normalized.startsWith("restarting");
}

function imageId(output: string, service: string): string {
	const id = output.trim();
	if (!/^sha256:[a-f0-9]+$/iu.test(id)) throw new Error(`Cannot resolve the current ${service} image ID`);
	return id;
}

export async function resolveDevelopmentBackupImageId(input: {
	service: string;
	configuredReference: string;
	containers: readonly DevelopmentComposeContainer[];
	capture: CaptureDocker;
}): Promise<string> {
	const liveContainers = input.containers.filter(
		(container) => container.Service === input.service && isLive(container.State),
	);
	if (liveContainers.length === 0) {
		return imageId(
			await input.capture(["image", "inspect", "--format", "{{.Id}}", input.configuredReference]),
			input.service,
		);
	}

	const ids = await Promise.all(
		liveContainers.map(async (container) => {
			const identifier = container.ID || container.Name;
			if (!identifier) throw new Error(`Cannot identify the running ${input.service} container`);
			return imageId(
				await input.capture(["container", "inspect", "--format", "{{.Image}}", identifier]),
				input.service,
			);
		}),
	);
	const uniqueIds = [...new Set(ids)];
	if (uniqueIds.length !== 1) {
		throw new Error(`Running ${input.service} replicas use different images; converge them before upgrading`);
	}
	return uniqueIds[0] as string;
}
