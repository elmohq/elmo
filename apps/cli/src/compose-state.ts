export interface ComposeServiceState {
	Service: string;
	State: string;
}

export function runningComposeServiceNames(services: readonly ComposeServiceState[]): string[] {
	return services.filter((service) => service.State?.startsWith("running")).map((service) => service.Service);
}

export function runningApplicationServiceNames(runningServices: readonly string[]): string[] {
	return runningServices.filter((service) => service === "web" || service === "worker");
}

export function applicationStartupOrder(services: readonly string[]): string[] {
	const priority = (service: string) => (service === "worker" ? 0 : service === "web" ? 1 : 2);
	return [...new Set(services)].sort((left, right) => priority(left) - priority(right));
}
