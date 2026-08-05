export function createCloudBillingReadinessGate(input: {
	mode: string | undefined;
	validate: () => Promise<void>;
}): () => Promise<void> {
	let validation: Promise<void> | undefined;
	return async () => {
		if (input.mode !== "cloud") return;
		validation ??= input.validate();
		await validation;
	};
}
