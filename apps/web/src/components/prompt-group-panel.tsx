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
import { marketLabel } from "@/lib/prompt-markets";
import type { GroupTargetRow } from "@/server/prompt-group-core";
import { getPromptGroupFn } from "@/server/prompt-groups";

type Member = { id: string; value: string; enabled: boolean; country: string; language: string };
type Handling = GroupTargetRow["byPrompt"][string];

function handlingText(handling: Handling | undefined, member: Member): { text: string; tone: "ok" | "muted" | "off" } {
	if (!handling) return { text: "Not tracked", tone: "muted" };
	if (!handling.runs) return { text: `Not run: can't answer from ${countryName(member.country)}`, tone: "off" };
	const language =
		handling.language === "sent" ? `${languageName(member.language)} sent` : "language from the prompt's wording";
	switch (handling.country) {
		case "localized":
			return { text: `Asked from ${countryName(member.country)}, ${language}`, tone: "ok" };
		case "provider-default":
			return { text: `Provider's default market, can't be set; ${language}`, tone: "muted" };
		default:
			return { text: "No web search, so the answer isn't local", tone: "muted" };
	}
}

/**
 * The prompt's group — the same question in other countries and languages —
 * with a way across to each, and what every configured model does with each
 * one. Folded by default: the breakdown matters when a result looks off, not
 * on every visit.
 */
export function PromptGroupPanel({ brandId, promptId }: { brandId: string; promptId: string }) {
	const brandParams = useBrandParams();
	// Moving between variants keeps the tab you're on.
	const search = useSearch({ from: "/_authed/app/org/$org/brand/$brand/prompts/$promptId" });
	const { data } = useQuery({
		queryKey: ["prompt-group", brandId, promptId],
		queryFn: () => getPromptGroupFn({ data: { brandId, promptId } }),
		enabled: Boolean(brandId && promptId),
		staleTime: 60_000,
	});
	if (!data) return null;

	const { members, targets } = data;
	const notRunAnywhere = targets.filter((target) =>
		members.some((member) => target.byPrompt[member.id] && !target.byPrompt[member.id].runs),
	).length;

	return (
		<div className="space-y-3 pb-6">
			{members.length > 1 && (
				<div className="flex flex-wrap items-center gap-1.5 text-sm">
					<span className="mr-1 text-muted-foreground">Variants:</span>
					{members.map((member) => (
						<Link
							key={member.id}
							to="/app/org/$org/brand/$brand/prompts/$promptId"
							params={{ ...brandParams, promptId: member.id }}
							search={{ tab: search.tab }}
							title={member.value}
							className={cn(
								"rounded-md border px-2 py-0.5 text-xs transition-colors",
								member.id === promptId
									? "border-foreground/30 bg-accent font-medium"
									: "text-muted-foreground hover:bg-muted hover:text-foreground",
							)}
						>
							{countryName(member.country)} · {languageName(member.language)}
						</Link>
					))}
				</div>
			)}

			{targets.length > 0 && (
				<Collapsible className="rounded-md border">
					<CollapsibleTrigger className="group flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-left text-sm">
						<ChevronRight className="size-4 text-muted-foreground transition-transform group-data-[panel-open]:rotate-90" />
						<span className="font-medium">
							How each model runs {members.length > 1 ? "these prompts" : "this prompt"}
						</span>
						{notRunAnywhere > 0 && (
							<span className="text-xs text-muted-foreground">
								{notRunAnywhere} {notRunAnywhere === 1 ? "model skips" : "models skip"} a country it can't answer from
							</span>
						)}
					</CollapsibleTrigger>
					<CollapsibleContent>
						<div className="overflow-x-auto border-t">
							<table className="w-full text-sm">
								<thead>
									<tr className="border-b text-left text-xs text-muted-foreground">
										<th className="px-3 py-2 font-medium">Model</th>
										{members.map((member) => (
											<th
												key={member.id}
												className={cn("px-3 py-2 font-mono font-medium", member.id === promptId && "text-foreground")}
											>
												{marketLabel(member)}
											</th>
										))}
									</tr>
								</thead>
								<tbody>
									{targets.map((target) => (
										<tr key={target.key} className="border-b last:border-0 align-top">
											<td className="whitespace-nowrap px-3 py-2">
												<div className="flex items-center gap-2">
													<ModelIcon iconId={getModelMeta(target.model).iconId} className="size-4" />
													<span>{target.modelLabel}</span>
												</div>
												<div className="pl-6 text-xs text-muted-foreground">
													{target.providerName}
													{target.premium ? ", premium" : target.webSearch ? ", web search" : ", no web search"}
												</div>
											</td>
											{members.map((member) => {
												const { text, tone } = handlingText(target.byPrompt[member.id], member);
												return (
													<td
														key={member.id}
														className={cn(
															"px-3 py-2 text-xs",
															tone === "muted" && "text-muted-foreground",
															tone === "off" && "text-destructive",
														)}
													>
														{text}
													</td>
												);
											})}
										</tr>
									))}
								</tbody>
							</table>
						</div>
						<p className="border-t px-3 py-2 text-xs text-muted-foreground">
							Models are only run in countries they can answer from, so no result is filed under the wrong market. Where
							a provider takes no language, the prompt's own wording decides the language of the answer.
						</p>
					</CollapsibleContent>
				</Collapsible>
			)}
		</div>
	);
}
