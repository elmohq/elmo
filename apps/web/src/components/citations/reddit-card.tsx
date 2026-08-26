import { useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@workspace/ui/components/card";
import { Separator } from "@workspace/ui/components/separator";
import { Badge } from "@workspace/ui/components/badge";
import { Tooltip, TooltipTrigger, TooltipContent } from "@workspace/ui/components/tooltip";
import { IconExternalLink, IconInfoCircle, IconChevronDown } from "@tabler/icons-react";
import { ListPagination, usePagedList } from "@/components/list-pagination";
import { extractSubreddit, formatUrlForDisplay } from "@/components/citations/shared";
import type { CitationData } from "@/components/citations/types";

const SUBREDDITS_PAGE_SIZE = 8;

/** Exact-host check (citation `domain` is a normalized lowercase hostname).
 *  A substring match would also catch lookalikes such as
 *  "notreddit.com" or "reddit.com.evil.net" (CodeQL js/incomplete-url-substring-sanitization). */
const isRedditDomain = (domain: string) => domain === "reddit.com" || domain.endsWith(".reddit.com");

interface SubredditTally {
	count: number;
	newPages: number;
	totalPages: number;
	urls: { url: string; title?: string; count: number; isNew?: boolean }[];
}

/** Cited Reddit pages folded onto the subreddit they belong to. */
function groupBySubreddit(specificUrls: CitationData["specificUrls"]): Map<string, SubredditTally> {
	const bySubreddit = new Map<string, SubredditTally>();
	for (const cited of specificUrls) {
		if (!isRedditDomain(cited.domain)) continue;
		const subreddit = extractSubreddit(cited.url);
		if (!subreddit) continue;

		const tally = bySubreddit.get(subreddit) ?? { count: 0, newPages: 0, totalPages: 0, urls: [] };
		tally.count += cited.count;
		tally.totalPages += 1;
		if (cited.isNew) tally.newPages += 1;
		tally.urls.push({ url: cited.url, title: cited.title, count: cited.count, isNew: cited.isNew });
		bySubreddit.set(subreddit, tally);
	}
	return bySubreddit;
}

export function useSubredditData(
	specificUrls: CitationData["specificUrls"],
	whatsChanged: CitationData["whatsChanged"],
) {
	return useMemo(() => {
		const droppedUrlSet = new Set(
			whatsChanged?.droppedUrls
				.filter((u) => isRedditDomain(u.domain))
				.map((u) => extractSubreddit(u.url))
				.filter(Boolean) ?? [],
		);

		return Array.from(groupBySubreddit(specificUrls).entries())
			.map(([name, data]) => ({
				name,
				count: data.count,
				newPages: data.newPages,
				totalPages: data.totalPages,
				allNew: data.newPages === data.totalPages,
				hasDropped: droppedUrlSet.has(name),
				urls: data.urls.sort((a, b) => b.count - a.count),
			}))
			.sort((a, b) => b.count - a.count);
	}, [specificUrls, whatsChanged]);
}

export function RedditCard({ subreddits }: { subreddits: ReturnType<typeof useSubredditData> }) {
	const [expandedSubreddit, setExpandedSubreddit] = useState<string | null>(null);
	const { page, setPage, pageItems, totalItems } = usePagedList(subreddits, SUBREDDITS_PAGE_SIZE);

	return (
		<Card>
			<CardHeader>
				<CardTitle className="flex items-center gap-1.5">
					Reddit
					<Tooltip>
						<TooltipTrigger render={<IconInfoCircle className="h-3.5 w-3.5 text-muted-foreground cursor-help" />} />
						<TooltipContent className="max-w-xs text-sm font-normal">
							Reddit communities most frequently cited by AI models. Extracted from all reddit.com URLs in your citation
							data.
						</TooltipContent>
					</Tooltip>
				</CardTitle>
				<CardDescription>
					Top cited subreddits — which Reddit communities AI models reference when answering your prompts
				</CardDescription>
			</CardHeader>
			<Separator />
			<CardContent>
				<div className="divide-y divide-border/50">
					{pageItems.map((sub) => {
						const isExpanded = expandedSubreddit === sub.name;
						return (
							<div key={sub.name}>
								<div className="flex items-center justify-between py-2">
									<button
										type="button"
										onClick={() => setExpandedSubreddit(isExpanded ? null : sub.name)}
										className="flex items-center gap-1.5 min-w-0 cursor-pointer group"
									>
										<IconChevronDown
											className={`h-3.5 w-3.5 text-muted-foreground transition-transform ${isExpanded ? "" : "-rotate-90"}`}
										/>
										<span className="text-sm font-medium text-foreground group-hover:underline truncate">
											{sub.name}
										</span>
										{sub.allNew && (
											<Badge className="text-[10px] px-1.5 py-0 h-[18px] border-0 shadow-none bg-green-100 text-green-700">
												NEW
											</Badge>
										)}
										{!sub.allNew && sub.newPages > 0 && (
											<span className="text-[10px] text-green-600 whitespace-nowrap">+{sub.newPages} new</span>
										)}
										{sub.hasDropped && <span className="text-[10px] text-red-500 whitespace-nowrap">some dropped</span>}
									</button>
									<div className="flex items-center gap-2 shrink-0 ml-3">
										<span className="text-sm font-semibold tabular-nums">{sub.count.toLocaleString()}</span>
										<a
											href={`https://reddit.com/${sub.name}`}
											target="_blank"
											rel="noopener noreferrer"
											onClick={(e) => e.stopPropagation()}
											className="text-muted-foreground hover:text-foreground transition-colors"
										>
											<IconExternalLink className="h-3.5 w-3.5" />
										</a>
									</div>
								</div>
								{isExpanded && sub.urls.length > 0 && (
									<div className="pl-5 pb-2 space-y-0.5">
										{sub.urls.map((u) => (
											<a
												key={u.url}
												href={u.url}
												target="_blank"
												rel="noopener noreferrer"
												className="flex items-center justify-between py-1 group text-xs"
											>
												<span className="text-muted-foreground group-hover:text-foreground group-hover:underline truncate min-w-0 flex items-center gap-1.5">
													{u.title || formatUrlForDisplay(u.url)}
													{u.isNew && (
														<Badge className="text-[9px] px-1 py-0 h-[14px] border-0 shadow-none bg-green-100 text-green-700 shrink-0">
															NEW
														</Badge>
													)}
												</span>
												<span className="tabular-nums text-muted-foreground shrink-0 ml-3">
													{u.count.toLocaleString()}
												</span>
											</a>
										))}
									</div>
								)}
							</div>
						);
					})}
				</div>
				<ListPagination page={page} pageSize={SUBREDDITS_PAGE_SIZE} totalItems={totalItems} onPageChange={setPage} />
			</CardContent>
		</Card>
	);
}
