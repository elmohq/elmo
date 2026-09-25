import { Badge } from "@workspace/ui/components/badge";
import { Card, CardContent, CardHeader } from "@workspace/ui/components/card";
import { Separator } from "@workspace/ui/components/separator";
import { Skeleton } from "@workspace/ui/components/skeleton";
import type { ReactNode } from "react";
import { ResponseMarkdown } from "@/components/response-markdown";
import { SiteIcon } from "@/components/site-icon";
import { skeletonRows } from "@/lib/skeleton-rows";
import { getModelDisplayName } from "@/lib/utils";

export interface ResponseCardRun {
	model: string;
	version: string;
	createdAt: Date | string;
	webQueries: string[] | null;
	brandMentioned: boolean;
	competitorsMentioned: string[] | null;
	rawOutput: unknown;
}

const formatDate = (value: Date | string) => new Date(value).toLocaleString(undefined, { timeZoneName: "short" });

const formatRawOutput = (rawOutput: unknown) =>
	typeof rawOutput === "string" ? rawOutput : JSON.stringify(rawOutput, null, 2);

/** One engine's answer to one prompt run, with what it searched for and whom it named. */
export function ResponseCard({
	run,
	text,
	prompt,
	brandName,
	domainFor,
}: {
	run: ResponseCardRun;
	text: string;
	/** Shown above the run details where the list mixes prompts. */
	prompt?: ReactNode;
	brandName?: string;
	domainFor: (name: string) => string | undefined;
}) {
	return (
		<Card>
			<CardHeader className="pb-0 gap-y-0">
				{prompt && (
					<div className="mb-3 text-sm">
						<span className="text-muted-foreground block text-xs mb-0.5">Prompt</span>
						{prompt}
					</div>
				)}
				<div className="grid grid-cols-3 gap-x-4 text-sm">
					<div>
						<span className="text-muted-foreground block text-xs mb-0.5">Model</span>
						<span>{getModelDisplayName(run.model)}</span>
					</div>
					<div>
						<span className="text-muted-foreground block text-xs mb-0.5">Version</span>
						<span>{run.version}</span>
					</div>
					<div>
						<span className="text-muted-foreground block text-xs mb-0.5">Evaluated</span>
						<span>{formatDate(run.createdAt)}</span>
					</div>
				</div>
			</CardHeader>
			<Separator />
			<CardContent className="space-y-5">
				{run.webQueries && run.webQueries.length > 0 && (
					<div>
						<span className="text-xs text-muted-foreground block mb-1.5">Web Queries</span>
						<div className="flex flex-wrap gap-1.5">
							{[...new Set<string>(run.webQueries)].map((query) => (
								<Badge key={query} variant="outline" className="text-xs font-normal">
									{query}
								</Badge>
							))}
						</div>
					</div>
				)}

				<div>
					<span className="text-xs text-muted-foreground block mb-1.5">Brands Mentioned</span>
					<div className="flex flex-wrap gap-1.5">
						{run.brandMentioned && brandName && (
							<Badge className="text-xs font-normal">
								<SiteIcon domain={domainFor(brandName)} size="xs" />
								{brandName}
							</Badge>
						)}
						{[...new Set<string>(run.competitorsMentioned ?? [])].map((competitor) => (
							<Badge key={competitor} variant="outline" className="text-xs font-normal">
								<SiteIcon domain={domainFor(competitor)} size="xs" />
								{competitor}
							</Badge>
						))}
						{!run.brandMentioned && (!run.competitorsMentioned || run.competitorsMentioned.length === 0) && (
							<span className="text-xs text-muted-foreground">None</span>
						)}
					</div>
				</div>

				<div>
					<span className="text-xs text-muted-foreground block mb-1.5">LLM Response</span>
					<div className="rounded-md border bg-muted/30 p-4 max-h-64 overflow-auto">
						<ResponseMarkdown>{text}</ResponseMarkdown>
					</div>
				</div>

				<div>
					<span className="text-xs text-muted-foreground block mb-1.5">Raw Output</span>
					<div className="rounded-md border bg-muted/20 p-4 max-h-64 overflow-auto">
						<pre className="text-xs font-mono leading-relaxed whitespace-pre-wrap">
							{formatRawOutput(run.rawOutput)}
						</pre>
					</div>
				</div>
			</CardContent>
		</Card>
	);
}

export function ResponseCardSkeletons({ count }: { count: number }) {
	return (
		<div className="space-y-4">
			{skeletonRows(count).map((row) => (
				<Card key={row}>
					<CardHeader className="pb-0 gap-y-0">
						<div className="grid grid-cols-3 gap-x-4">
							<div>
								<Skeleton className="h-4 w-20 mb-1" />
								<Skeleton className="h-4 w-16" />
							</div>
							<div>
								<Skeleton className="h-4 w-16 mb-1" />
								<Skeleton className="h-4 w-24" />
							</div>
							<div>
								<Skeleton className="h-4 w-20 mb-1" />
								<Skeleton className="h-4 w-32" />
							</div>
						</div>
					</CardHeader>
					<Separator />
					<CardContent className="space-y-4">
						<Skeleton className="h-20 w-full" />
					</CardContent>
				</Card>
			))}
		</div>
	);
}
