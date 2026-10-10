/**
 * What each configured model does with each prompt in a group: whether it runs
 * it at all, and whether the country and language reach the provider. The
 * prompt page shows this so a result is never read as more local than it is.
 */
import type { Entitlements } from "@workspace/config/entitlements";
import { getModelMeta } from "@workspace/config/models";
import type { ModelConfig } from "@workspace/config/scrape-targets";
import {
	type CountryHandling,
	describeProvider,
	describeTargetRun,
	isGroundedApiTarget,
	type LanguageHandling,
} from "@workspace/lib/providers";
import { resolveRunPlanIgnoringCountry, targetKey } from "@workspace/lib/run-policy";

export interface GroupMemberRow {
	id: string;
	value: string;
	enabled: boolean;
	country: string;
	language: string;
	premiumModels: string[];
}

export interface GroupTargetRow {
	key: string;
	model: string;
	modelLabel: string;
	providerName: string;
	webSearch: boolean;
	premium: boolean;
	/** Per member id; absent when the member isn't tracked on this target at all (an unpicked premium model). */
	byPrompt: Record<string, { runs: boolean; country: CountryHandling; language: LanguageHandling }>;
}

export function describeGroupRuns(input: {
	members: GroupMemberRow[];
	scrapeTargets: ModelConfig[];
	brand: { enabledModels: string[] | null; delayOverrideHours: number | null };
	entitlements: Entitlements;
	defaultDelayHours: number;
}): GroupTargetRow[] {
	const rows = new Map<string, GroupTargetRow>();
	for (const member of input.members) {
		const plan = resolveRunPlanIgnoringCountry({
			scrapeTargets: input.scrapeTargets,
			brand: input.brand,
			prompt: { premiumModels: member.premiumModels, country: member.country },
			entitlements: input.entitlements,
			defaultDelayHours: input.defaultDelayHours,
		});
		for (const { config } of plan.targets) {
			const key = targetKey(config);
			const row = rows.get(key) ?? {
				key,
				model: config.model,
				modelLabel: getModelMeta(config.model).label,
				providerName: describeProvider(config.provider).name,
				webSearch: config.webSearch,
				premium: isGroundedApiTarget(config),
				byPrompt: {},
			};
			row.byPrompt[member.id] = describeTargetRun(config, member);
			rows.set(key, row);
		}
	}
	return [...rows.values()];
}
