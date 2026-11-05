/**
 * Which saves have earned an immediate run.
 *
 * A platform or premium model that was just added has no run history, so its
 * target is due the moment it is saved — waiting out the cadence leaves the
 * customer looking at a setting that hasn't taken effect. Dropping one, or
 * saving with nothing changed, earns nothing: the cycle it would trigger is
 * paid provider calls for answers already on file.
 */

/**
 * Platforms `next` adds over `previous`. Null on either side means "every
 * configured target", which is what a brand with no explicit picks follows.
 */
export function addedPlatforms(previous: string[] | null, next: string[] | null, configured: string[]): string[] {
	const before = new Set(previous ?? configured);
	return (next ?? configured).filter((model) => !before.has(model));
}

/**
 * Prompts that gained a premium model in a save. Prompts created by the same
 * save are excluded — their chain starts immediately anyway, and expediting a
 * job that doesn't exist yet would race it.
 */
export function promptsGainingPremium(
	before: Map<string, { premiumModels: string[] }>,
	after: { id: string; premiumModels: string[] }[],
): string[] {
	return after
		.filter((prompt) => {
			const previous = before.get(prompt.id);
			return previous !== undefined && prompt.premiumModels.some((model) => !previous.premiumModels.includes(model));
		})
		.map((prompt) => prompt.id);
}
