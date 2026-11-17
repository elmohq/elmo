/** Mock for @/server/prompt-translation: marks each text with its market, the way the stub provider does. */
export const translatePromptsFn = async ({
	data,
}: {
	data: { market: { country: string; language: string }; texts: string[] };
}) =>
	data.texts.map((source) => ({
		source,
		translation: `${source} (${data.market.language}-${data.market.country})`,
	}));
