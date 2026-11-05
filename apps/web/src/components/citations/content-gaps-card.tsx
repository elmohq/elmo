import { IconAlertTriangle, IconInfoCircle } from "@tabler/icons-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@workspace/ui/components/card";
import { Separator } from "@workspace/ui/components/separator";
import { Tooltip, TooltipContent, TooltipTrigger } from "@workspace/ui/components/tooltip";
import { BrandPromptLink } from "@/components/brand-prompt-link";
import { ListPagination, usePagedList } from "@/components/list-pagination";

const PAGE_SIZE = 6;

export function ContentGapsCard({
	prompts,
}: {
	prompts: Array<{ id: string; value: string; competitorCitationCount: number; uniqueCompetitors: number }>;
}) {
	const { page, setPage, pageItems, totalItems } = usePagedList(prompts, PAGE_SIZE);

	return (
		<Card className="h-full flex flex-col">
			<CardHeader>
				<CardTitle className="flex items-center gap-1.5">
					Content Gaps
					<Tooltip>
						<TooltipTrigger render={<IconInfoCircle className="h-3.5 w-3.5 text-muted-foreground cursor-help" />} />
						<TooltipContent className="max-w-xs text-sm font-normal">
							Prompts where competitors are cited but your brand isn&apos;t — opportunities to improve your citation
							presence.
						</TooltipContent>
					</Tooltip>
				</CardTitle>
				<CardDescription>Prompts where competitors are cited but your brand isn&apos;t</CardDescription>
			</CardHeader>
			<Separator />
			<CardContent className="flex-1 flex flex-col">
				<div className="divide-y divide-border/50 flex-1">
					{pageItems.map((prompt) => (
						<BrandPromptLink key={prompt.id} promptId={prompt.id} className="flex items-start gap-2.5 py-2 group">
							<div className="shrink-0 mt-0.5">
								<IconAlertTriangle className="h-3.5 w-3.5 text-amber-500" />
							</div>
							<div className="min-w-0 flex-1">
								<div className="flex items-center gap-1.5">
									<span className="text-sm font-medium truncate text-foreground group-hover:underline">
										{prompt.value}
									</span>
								</div>
								<p className="text-xs text-muted-foreground mt-0.5">
									{prompt.uniqueCompetitors} {prompt.uniqueCompetitors === 1 ? "competitor" : "competitors"} cited{" "}
									{prompt.competitorCitationCount} {prompt.competitorCitationCount === 1 ? "time" : "times"} &mdash;
									your brand cited 0 times
								</p>
							</div>
						</BrandPromptLink>
					))}
				</div>
				<ListPagination page={page} pageSize={PAGE_SIZE} totalItems={totalItems} onPageChange={setPage} />
			</CardContent>
		</Card>
	);
}
