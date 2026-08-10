/**
 * Logos for the AI platforms Elmo tracks.
 *
 * Shared so the product and the marketing site show the same mark for the same
 * platform. Which logo a model uses is decided by `iconId` in
 * @workspace/config/models; this only turns that into an icon, falling back to a
 * neutral glyph for anything without a brand mark.
 */
import { Sparkles } from "lucide-react";
import type { IconType } from "react-icons";
import { RiOpenaiFill } from "react-icons/ri";
import {
	SiAnthropic,
	SiDeepseek,
	SiGithubcopilot,
	SiGoogle,
	SiMistralai,
	SiMoonshotai,
	SiPerplexity,
	SiQwen,
	SiX,
} from "react-icons/si";

/**
 * Keyed by `iconId`, which is an arbitrary string from the model catalog — a
 * model with no brand mark simply has no entry here and falls back below.
 */
const ICONS: Record<string, IconType> = {
	// OpenAI's logo left Simple Icons in 5.7.0 for trademark reasons; Remix Icon
	// still ships the blossom mark.
	openai: RiOpenaiFill,
	anthropic: SiAnthropic,
	google: SiGoogle,
	microsoft: SiGithubcopilot,
	perplexity: SiPerplexity,
	x: SiX,
	mistral: SiMistralai,
	deepseek: SiDeepseek,
	moonshotai: SiMoonshotai,
	qwen: SiQwen,
};

export function ModelIcon({ iconId, className = "size-3.5" }: { iconId: string; className?: string }) {
	const Icon = ICONS[iconId];
	if (!Icon) return <Sparkles className={className} />;
	return <Icon className={className} />;
}
