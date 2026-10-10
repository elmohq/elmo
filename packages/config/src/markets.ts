/**
 * A market is a country and a language together: what a prompt is asked from
 * and in. Picked as one choice from this list rather than two independent
 * ones, so the picker only offers pairs people actually search in.
 */
import { COUNTRIES, countryName } from "./countries";
import { languageName } from "./languages";

export interface Market {
	country: string;
	language: string;
}

/**
 * Each country's own languages. English is offered everywhere on top, since
 * English-language searches are common in every market Elmo covers.
 */
const LOCAL_LANGUAGES: Record<string, readonly string[]> = {
	US: ["es"],
	CA: ["fr"],
	DE: ["de"],
	AT: ["de"],
	CH: ["de", "fr", "it"],
	FR: ["fr"],
	BE: ["nl", "fr"],
	NL: ["nl"],
	LU: ["fr", "de"],
	ES: ["es", "ca"],
	PT: ["pt-BR"],
	IT: ["it"],
	SE: ["sv"],
	NO: ["no"],
	DK: ["da"],
	FI: ["fi"],
	PL: ["pl"],
	CZ: ["cs"],
	GR: ["el"],
	RO: ["ro"],
	HU: ["hu"],
	UA: ["uk"],
	TR: ["tr"],
	IL: ["he"],
	AE: ["ar"],
	SA: ["ar"],
	EG: ["ar"],
	IN: ["hi"],
	SG: ["zh-CN", "ms"],
	MY: ["ms"],
	ID: ["id"],
	PH: ["fil"],
	TH: ["th"],
	VN: ["vi"],
	JP: ["ja"],
	KR: ["ko"],
	TW: ["zh-TW"],
	HK: ["zh-TW"],
	MX: ["es"],
	BR: ["pt-BR"],
	AR: ["es"],
	CL: ["es"],
	CO: ["es"],
	PE: ["es"],
};

/** Local languages first, so a country's own language leads its entries. */
export const MARKETS: readonly Market[] = COUNTRIES.flatMap(({ code }) =>
	[...new Set([...(LOCAL_LANGUAGES[code] ?? []), "en"])].map((language) => ({ country: code, language })),
);

/** "GB · EN" — compact enough for a chip or a card title. */
export function marketCode(market: Market): string {
	return `${market.country} · ${market.language.toUpperCase()}`;
}

/** "Switzerland (French)" */
export function marketName(market: Market): string {
	return `${countryName(market.country)} (${languageName(market.language)})`;
}

export function sameMarket(a: Market, b: Market): boolean {
	return a.country === b.country && a.language === b.language;
}
