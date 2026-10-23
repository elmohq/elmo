import * as p from "@clack/prompts";
import pc from "picocolors";
import type { EnvMap } from "./config.js";
import { assertNotCancelled, link } from "./util.js";

const SIGNUP_URL = "https://console.typesafe.ai";

export async function collectJudgeKey(env: EnvMap): Promise<void> {
	const viaOpenRouter = Boolean(env.OPENROUTER_API_KEY?.trim());
	p.note(
		[
			"Elmo reads every answer with Jev (TypeSafe) to decide which ones really",
			"mention your brand and competitors, how they describe each, and the",
			"passage that shows it. Answers that name a tracked company are sent to",
			"TypeSafe for this; the rest cost nothing.",
			"",
			"Very roughly $0.15–0.35 per 1,000 answers, more when answers are long or",
			"name many competitors. With the default 5 samples a day, 25 prompts on 3",
			"platforms is ~11,000 answers, about $2–4 a month; 100 prompts on 5",
			"platforms is ~75,000, about $11–26.",
			"",
			"On first start Elmo also re-judges the last 90 days of history once",
			"(REPROCESS_DAYS), about three months of the above.",
			"",
			...(viaOpenRouter
				? [
						"Your OpenRouter key can call Jev instead, billed to your OpenRouter",
						"account: leave the TypeSafe key empty to use it.",
						"",
					]
				: []),
			`Get a key: ${link(pc.cyan(SIGNUP_URL), SIGNUP_URL)}`,
		].join("\n"),
		"Mention and sentiment judging",
	);
	const key = await p.password({
		message: viaOpenRouter ? "TypeSafe API key (for Jev; leave empty to use OpenRouter)" : "TypeSafe API key (for Jev)",
		validate: (value) => (value?.trim() || viaOpenRouter ? undefined : "Required"),
	});
	assertNotCancelled(key);
	if (key?.trim()) env.TYPESAFE_API_KEY = key.trim();
}
