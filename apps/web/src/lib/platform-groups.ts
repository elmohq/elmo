/**
 * How the LLM settings page groups tracked platforms.
 *
 * The three groups answer different questions about a brand, which is why they
 * are separate cards with their own copy rather than one grid of pills: a
 * scraped surface tells you what a visitor sees, an ungrounded API call tells
 * you what the model already believes, and a grounded one tells you what it
 * finds and cites. They also behave differently — grounded calls cost roughly
 * ten times an ungrounded one, so in cloud they are metered per prompt instead
 * of picked per brand.
 *
 * The tiers themselves — their ids and names — belong to the plan catalog,
 * which prices them. Only the long descriptions live here, because this page is
 * the one surface with room for them.
 */
import { PLATFORM_TIER_LABELS, type PlanPlatformGroupId } from "@workspace/config/plans";
import type { PlatformOption } from "@/components/platform-picker";

export interface PlatformGroup {
	id: PlanPlatformGroupId;
	title: string;
	description: string;
	options: PlatformOption[];
}

const GROUP_DESCRIPTIONS: Record<PlanPlatformGroupId, string> = {
	scraped:
		"Driven the way a person would, then read back from the answer they render. You see what a real visitor sees — the sources cited, and any shopping or search modules alongside the answer.",
	api: "Called directly, with no web search. These show how a model describes your brand from what it already knows, which is what it will say when nobody hands it a source. They cite nothing.",
	premium:
		"Called directly with the model's own web-search tool switched on, so the answer is grounded in live sources and cites them. Chosen per prompt in the prompts editor and added to the picks above, which keep running on every prompt either way. A grounded call costs roughly ten times an ungrounded one, so each prompt/model pair spends a slot.",
};

/** Which group an option belongs to. The one place that rule is decided. */
export function platformGroupId(option: PlatformOption): PlanPlatformGroupId {
	if (option.access === "scraped") return "scraped";
	return option.webSearch ? "premium" : "api";
}

/**
 * Split options into their groups, cheapest signal first, dropping any group the
 * instance configures nothing for. Order within a group is preserved so it keeps
 * following SCRAPE_TARGETS.
 */
export function groupPlatformOptions(options: PlatformOption[]): PlatformGroup[] {
	const order: PlanPlatformGroupId[] = ["scraped", "api", "premium"];
	return order
		.map((id) => ({
			id,
			...platformGroupCopy(id),
			options: options.filter((option) => platformGroupId(option) === id),
		}))
		.filter((group) => group.options.length > 0);
}

export function platformGroupCopy(id: PlanPlatformGroupId): { title: string; description: string } {
	return { title: PLATFORM_TIER_LABELS[id], description: GROUP_DESCRIPTIONS[id] };
}
