/**
 * Guesses the language a prompt is written in, so nobody has to set it by hand.
 * Prompts are a handful of words and often half brand names, which is where
 * detectors go wrong, so this only answers when the text is clearly in one
 * language.
 */
import { LANGUAGES } from "@workspace/config/markets";
import { wholeWordPattern } from "../mentions";

/**
 * The detector's score below which a guess is dropped. Short English prompts
 * made of product names score up to about 0.66 for some other language; real
 * text in another language scores 0.7 and up.
 */
const MIN_CONFIDENCE = 0.7;

/**
 * Answers the detector gives for more than one supported language: it has no
 * Indonesian and reads it as Malay, and reads Serbian in Latin script as
 * Croatian. Neither is safe to store unasked.
 */
const AMBIGUOUS = new Set(["ms", "hr"]);

type Detector = typeof import("eld/medium")["eld"];

let detector: Promise<Detector> | undefined;

/** Loaded on first use: the model is megabytes that most processes never need. */
function loadDetector(): Promise<Detector> {
	detector ??= import("eld/medium").then(({ eld }) => {
		eld.setLanguageSubset(LANGUAGES.map((language) => language.code));
		return eld;
	});
	return detector;
}

/**
 * The supported language `text` is clearly written in, or null when it is unclear.
 * `ignore` holds brand and competitor names, which say nothing about the language around them.
 */
export async function detectLanguage(text: string, ignore: readonly string[] = []): Promise<string | null> {
	const names = ignore.filter((name) => name.trim().length > 0);
	const stripped = names.reduce((rest, name) => rest.replace(wholeWordPattern(name), " "), text);

	const result = (await loadDetector()).detect(stripped);
	if (!result.language || !result.isReliable() || AMBIGUOUS.has(result.language)) return null;

	return (result.getScores()[result.language] ?? 0) >= MIN_CONFIDENCE ? result.language : null;
}
