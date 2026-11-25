/** Mock for @/server/prompt-translation: marks each text with its market, the way the stub provider does, and leaves text saved under the market's language as written. */
export const translatePromptsFn = async ({
	data,
}: {
	data: { market: { country: string; language: string }; texts: string[]; languages?: (string | null)[] };
}) =>
	data.texts.map((source, index) => ({
		source,
		translation:
			(data.languages?.[index] ?? "en") === data.market.language
				? source
				: `${source} (${data.market.language}-${data.market.country})`,
	}));

export const detectPromptLanguageFn = async (_: { data: { text: string } }) => null;
