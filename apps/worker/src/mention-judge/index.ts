import { createMentionAnalyzer, type MentionAnalyzer } from "@workspace/lib/mention-judge";
import { getCredential } from "@workspace/lib/secrets";

export type { MentionAnalyzer, RunMentions } from "@workspace/lib/mention-judge";

let current: MentionAnalyzer | undefined;

export function configureMentionAnalyzer(
	apiKey = process.env.TYPESAFE_API_KEY,
	openRouterKey: () => string | undefined = () => getCredential("OPENROUTER_API_KEY"),
): MentionAnalyzer {
	current = createMentionAnalyzer(apiKey, openRouterKey);
	return current;
}

export function mentionAnalyzer(): MentionAnalyzer {
	return current ?? configureMentionAnalyzer();
}
