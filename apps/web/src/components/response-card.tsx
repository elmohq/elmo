import type { MentionAssessment, RunMentionAssessments } from "@workspace/lib/mentions";
import { Badge } from "@workspace/ui/components/badge";
import { Card, CardContent, CardHeader } from "@workspace/ui/components/card";
import { Separator } from "@workspace/ui/components/separator";
import { Skeleton } from "@workspace/ui/components/skeleton";
import type { ReactNode } from "react";
import { ResponseMarkdown } from "@/components/response-markdown";
import { SiteIcon } from "@/components/site-icon";
import { HIGHLIGHT_CLASS, splitHighlights } from "@/lib/highlight";
import { assessedPassage } from "@/lib/passage";
import { skeletonRows } from "@/lib/skeleton-rows";
import { getModelDisplayName } from "@/lib/utils";

export interface ResponseCardRun {
	model: string;
	version: string;
	createdAt: Date | string;
	webQueries: string[] | null;
	brandMentioned: boolean;
	competitorsMentioned: string[] | null;
	/** Null when mentions came from substring matching, or when `text` isn't the stored text the offsets index. */
	mentionAssessments: RunMentionAssessments | null;
	rawOutput: unknown;
}

const formatDate = (value: Date | string) => new Date(value).toLocaleString(undefined, { timeZoneName: "short" });

const formatRawOutput = (rawOutput: unknown) =>
	typeof rawOutput === "string" ? rawOutput : JSON.stringify(rawOutput, null, 2);

export function ResponseCard({
	run,
	text,
	prompt,
	highlight,
	brandName,
	domainFor,
}: {
	run: ResponseCardRun;
	text: string;
	highlight?: string;
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
					<MentionedBrands run={run} brandName={brandName} domainFor={domainFor} />
				</div>

				<MentionPassages assessments={run.mentionAssessments} text={text} brandName={brandName} />

				<div>
					<span className="text-xs text-muted-foreground block mb-1.5">LLM Response</span>
					<div className="rounded-md border bg-muted/30 p-4 max-h-64 overflow-auto">
						<ResponseMarkdown highlight={highlight}>{text}</ResponseMarkdown>
					</div>
				</div>

				<div>
					<span className="text-xs text-muted-foreground block mb-1.5">Raw Output</span>
					<div className="rounded-md border bg-muted/20 p-4 max-h-64 overflow-auto">
						<pre className="text-xs font-mono leading-relaxed whitespace-pre-wrap">
							<Highlighted
								text={formatRawOutput(run.rawOutput)}
								// The JSON shows strings escaped, so the term is too.
								term={highlight && JSON.stringify(highlight).slice(1, -1)}
							/>
						</pre>
					</div>
				</div>
			</CardContent>
		</Card>
	);
}

/** Each company the answer counts as mentioning, with its position among them when the judge ranked it. */
function MentionedBrands({
	run,
	brandName,
	domainFor,
}: {
	run: ResponseCardRun;
	brandName?: string;
	domainFor: (name: string) => string | undefined;
}) {
	const competitors = [...new Set<string>(run.competitorsMentioned ?? [])];
	if (!run.brandMentioned && competitors.length === 0) {
		return <span className="text-xs text-muted-foreground">None</span>;
	}
	const positions = run.mentionAssessments;
	return (
		<div className="flex flex-wrap gap-1.5">
			{run.brandMentioned && brandName && (
				<Badge className="text-xs font-normal">
					<SiteIcon domain={domainFor(brandName)} size="xs" />
					{brandName}
					<Position value={positions?.brand?.position} />
				</Badge>
			)}
			{competitors.map((competitor) => (
				<Badge key={competitor} variant="outline" className="text-xs font-normal">
					<SiteIcon domain={domainFor(competitor)} size="xs" />
					{competitor}
					<Position value={positions?.competitors?.[competitor]?.position} />
				</Badge>
			))}
		</div>
	);
}

function Position({ value }: { value?: number }) {
	if (value === undefined) return null;
	return (
		<span className="opacity-60 tabular-nums" title={`Named ${ordinal(value)} among the tracked companies`}>
			#{value}
		</span>
	);
}

const ordinal = (n: number) => {
	const suffix = ["th", "st", "nd", "rd"][n % 100 > 10 && n % 100 < 14 ? 0 : n % 10] ?? "th";
	return `${n}${suffix}`;
};

const REASONS: Record<string, string> = {
	other_meaning: "the name is used in another sense",
	other_company: "a different company with the same name",
	no_info: "the answer says it has no information about it",
};

const SENTIMENTS: Record<string, string> = {
	positive: "Positive",
	neutral: "Neutral",
	negative: "Negative",
	mixed: "Mixed",
};

function assessmentLabel(record: MentionAssessment): string {
	if (!record.mentioned) return `Not counted: ${REASONS[record.reason ?? ""] ?? "not about it"}`;
	return record.sentiment ? SENTIMENTS[record.sentiment] : "Mentioned";
}

/**
 * The passage each assessment rests on: always the brand's, and a competitor's when it wasn't
 * counted, since those are the calls worth checking.
 */
function MentionPassages({
	assessments,
	text,
	brandName,
}: {
	assessments?: RunMentionAssessments | null;
	text: string;
	brandName?: string;
}) {
	const entries: { key: string; name: string; record: MentionAssessment }[] = [];
	if (assessments?.brand) entries.push({ key: "brand", name: brandName ?? "Your brand", record: assessments.brand });
	for (const [name, record] of Object.entries(assessments?.competitors ?? {})) {
		if (!record.mentioned) entries.push({ key: `competitor:${name}`, name, record });
	}
	const shown = entries.flatMap((entry) => {
		const passage = assessedPassage(text, entry.record);
		return passage ? [{ ...entry, passage }] : [];
	});
	if (shown.length === 0) return null;
	return (
		<div>
			<span className="text-xs text-muted-foreground block mb-1.5">Passages</span>
			<div className="space-y-2">
				{shown.map(({ key, name, record, passage }) => (
					<figure key={key} className="rounded-md border p-3 text-sm space-y-1.5">
						<figcaption className="flex flex-wrap items-center gap-1.5 text-xs">
							<span className="font-medium">{name}</span>
							<Badge variant="outline" className="text-xs font-normal">
								{assessmentLabel(record)}
							</Badge>
						</figcaption>
						<blockquote className="border-l-2 pl-3 text-muted-foreground">
							{/* Passages are cut from the stored answer, which is markdown. */}
							<ResponseMarkdown>{passage}</ResponseMarkdown>
						</blockquote>
					</figure>
				))}
			</div>
		</div>
	);
}

function Highlighted({ text, term }: { text: string; term?: string }) {
	if (!term) return text;
	let offset = 0;
	return splitHighlights(text, term).map((part) => {
		const key = offset;
		offset += part.text.length;
		return part.match ? (
			<mark key={key} className={HIGHLIGHT_CLASS}>
				{part.text}
			</mark>
		) : (
			<span key={key}>{part.text}</span>
		);
	});
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
