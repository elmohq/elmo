export function trackingTargetDispatchDisposition(
	availableTargetKeys: ReadonlySet<string>,
	targetKey: string,
): "dispatch" | "quarantine" {
	return availableTargetKeys.has(targetKey) ? "dispatch" : "quarantine";
}
