export const TREG_SUPPORTED_PROVIDERS = ["cloro", "dataforseo"] as const;

export function getTregProviders(value: string | undefined): string[] {
	const providers = [
		...new Set(
			(value ?? "")
				.split(",")
				.map((provider) => provider.trim())
				.filter(Boolean),
		),
	];
	for (const provider of providers) {
		if (!TREG_SUPPORTED_PROVIDERS.some((supported) => supported === provider)) {
			throw new Error(
				`TREG_PROVIDERS contains unsupported provider "${provider}"; supported providers: cloro, dataforseo`,
			);
		}
	}
	return providers;
}

export function tregProviderSelected(
	providerId: string,
	env: Record<string, string | undefined> = process.env,
): boolean {
	return getTregProviders(env.TREG_PROVIDERS).includes(providerId);
}

export function tregConfigurationError(providerId: string, env: Record<string, string | undefined>): string | null {
	try {
		if (!tregProviderSelected(providerId, env)) return null;
	} catch (error) {
		return error instanceof Error ? error.message : "Invalid TREG_PROVIDERS selection";
	}
	if (!env.TREG_API_KEY?.trim()) return "Treg requires TREG_API_KEY for selected providers";
	const cap = Number(env.TREG_MAX_COST_USD);
	if (!Number.isFinite(cap) || cap <= 0) return "TREG_MAX_COST_USD must be an explicit positive finite number";
	return null;
}
