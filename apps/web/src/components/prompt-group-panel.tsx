import { useQuery } from "@tanstack/react-query";
import { Link, useSearch } from "@tanstack/react-router";
import { countryName } from "@workspace/config/countries";
import { languageName } from "@workspace/config/languages";
import { getModelMeta } from "@workspace/config/models";
import { ModelIcon } from "@workspace/ui/brand/model-icon";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@workspace/ui/components/collapsible";
import { cn } from "@workspace/ui/lib/utils";
import { ChevronRight } from "lucide-react";
import { useBrandParams } from "@/hooks/use-route-params";
import { PROMPT_DETAIL_TABS, type PromptDetailTab } from "@/lib/prompt-detail-tabs";
import type { GroupTargetRow } from "@/server/prompt-group-core";
import { getPromptGroupFn } from "@/server/prompt-groups";

type Member = { id: string; value: string; enabled: boolean; country: string; language: string };
type Handling = GroupTargetRow["byPrompt"][string];

const TONES = {
	ok: "bg-green-500",
	muted: "bg-muted-foreground/40",
	off: "bg-destructive",
} as const;

function countryStatus(handling: Handling, country: string): { text: string; tone: keyof typeof TONES } {
	if (!handling.runs) return { text: `Skipped, can't ask from ${countryName(country)}`, tone: "off" };
	if (handling.country === "localized") return { text: `Asked from ${countryName(country)}`, tone: "ok" };
	if (handling.country === "provider-default")
		return { text: "Provider's default market (can't be set)", tone: "muted" };
	return { text: "Not location-specific (no web search)", tone: "muted" };
}

function Status({ text, tone }: { text: string; tone: keyof typeof TONES }) {
	return (
		<span className={cn("inline-flex items-center gap-1.5", tone === "off" && "text-destructive")}>
			<span className={cn("size-1.5 shrink-0 rounded-full", TONES[tone])} aria-hidden />
			{text}
		</span>
	);
}

/**
 * The prompt's group — the same question in other countries and languages —
 * with a way across to each, and what every configured model does with each
 * one. Folded by default: the breakdown matters when a result looks off, not
 * on every visit.
 */
export function PromptGroupPanel({ brandId, promptId }: { brandId: string; promptId: string }) {
	const { data } = useQuery({
		queryKey: ["prompt-group", brandId, promptId],
		queryFn: () => getPromptGroupFn({ data: { brandId, promptId } }),
		enabled: Boolean(brandId && promptId),
		staleTime: 60_000,
	});
	if (!data) return null;
	return <PromptGroupView promptId={promptId} members={data.members} targets={data.targets} />;
}

export function PromptGroupView({
	promptId,
	members,
	targets,
}: {
	promptId: string;
	members: Member[];
	targets: GroupTargetRow[];
}) {
	const brandParams = useBrandParams();
	// Moving between variants keeps the tab you're on.
	const tab = useSearch({
		strict: false,
		select: (s) => (PROMPT_DETAIL_TABS.includes(s.tab as PromptDetailTab) ? (s.tab as PromptDetailTab) : undefined),
	});
	const current = members.find((member) => member.id === promptId);
	if (!current) return null;

	const rows = targets.flatMap((target) => {
		const handling = target.byPrompt[current.id];
		return handling ? [{ target, handling }] : [];
	});
	const localized = rows.filter(({ handling }) => handling.country === "localized").length;
	const skipped = rows.filter(({ handling }) => !handling.runs).length;

	return (
		<div className="space-y-3 pb-6">
			{members.length > 1 && (
				<div className="flex flex-wrap items-center gap-2 text-sm">
					<span className="text-muted-foreground">Markets</span>
					<div className="inline-flex flex-wrap rounded-md border p-0.5">
						{members.map((member) => (
							<Link
								key={member.id}
								to="/app/org/$org/brand/$brand/prompts/$promptId"
								params={{ ...brandParams, promptId: member.id }}
								search={{ tab }}
								title={`${countryName(member.country)}, ${languageName(member.language)}: ${member.value}`}
								className={cn(
									"rounded px-2 py-0.5 font-mono text-xs transition-colors",
									member.id === promptId
										? "bg-foreground text-background"
										: "text-muted-foreground hover:bg-muted hover:text-foreground",
								)}
							>
								{member.country} · {member.language.toUpperCase()}
							</Link>
						))}
					</div>
				</div>
			)}

			{rows.length > 0 && (
				<Collapsible className="rounded-md border">
					<CollapsibleTrigger className="group flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-left text-sm">
						<ChevronRight className="size-4 text-muted-foreground transition-transform group-data-[panel-open]:rotate-90" />
						<span className="font-medium">How each model runs this prompt</span>
						<span className="text-xs text-muted-foreground">
							{localized} of {rows.length} asked from {countryName(current.country)}
							{skipped > 0 && `, ${skipped} skipped`}
						</span>
					</CollapsibleTrigger>
					<CollapsibleContent>
						<table className="w-full border-t text-sm">
							<thead>
								<tr className="border-b text-left text-xs text-muted-foreground">
									<th className="px-3 py-2 font-medium">Model</th>
									<th className="px-3 py-2 font-medium">Country</th>
									<th className="px-3 py-2 font-medium">Language</th>
								</tr>
							</thead>
							<tbody>
								{rows.map(({ target, handling }) => (
									<tr key={target.key} className="border-b last:border-0">
										<td className="px-3 py-2">
											<div className="flex items-center gap-2">
												<ModelIcon iconId={getModelMeta(target.model).iconId} className="size-4" />
												<span>{target.modelLabel}</span>
												<span className="text-xs text-muted-foreground">via {target.providerName}</span>
											</div>
										</td>
										<td className="px-3 py-2 text-xs">
											<Status {...countryStatus(handling, current.country)} />
										</td>
										<td className="px-3 py-2 text-xs text-muted-foreground">
											{!handling.runs
												? "—"
												: handling.language === "sent"
													? `${languageName(current.language)}, sent`
													: "Set by the prompt's wording"}
										</td>
									</tr>
								))}
							</tbody>
						</table>
					</CollapsibleContent>
				</Collapsible>
			)}
		</div>
	);
}
