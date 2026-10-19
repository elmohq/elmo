import type { MentionAssessment, RunMentionAssessments } from "@workspace/lib/mentions";
import { Badge } from "@workspace/ui/components/badge";
import { Card, CardContent, CardHeader } from "@workspace/ui/components/card";
import { Separator } from "@workspace/ui/components/separator";
import { Skeleton } from "@workspace/ui/components/skeleton";
import { cn } from "@workspace/ui/lib/utils";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { ResponseMarkdown } from "@/components/response-markdown";
import { SiteIcon } from "@/components/site-icon";
import { HIGHLIGHT_CLASS, type MarkRange, splitHighlights } from "@/lib/highlight";
import { passageRange } from "@/lib/passage";
import { isSentiment, SENTIMENT_STYLES, type Sentiment } from "@/lib/sentiment";
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
	const [selected, setSelected] = useState<string | null>(null);
	const companies = mentionedCompanies(run, text, brandName);
	const markRange = passageMark(companies.find((c) => c.name === selected));
	const answerRef = useRef<HTMLDivElement>(null);
	// The passage can sit below the answer box's fold, where marking it alone would show nothing.
	useEffect(() => {
		if (selected) answerRef.current?.querySelector("[data-passage]")?.scrollIntoView({ block: "nearest" });
	}, [selected]);
	return (
		<Card>
			<CardHeader className="pb-0 gap-y-0">
				{prompt && (
					<div className="mb-3 text-sm">
						<span className="text-muted-foreground block text-xs mb-0.5">Prompt</span>
						{prompt}
					</div>
				)}
				<div className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm sm:grid-cols-3">
					<div>
						<span className="text-muted-foreground block text-xs mb-0.5">Model</span>
						<span>{getModelDisplayName(run.model)}</span>
					</div>
					<div>
						<span className="text-muted-foreground block text-xs mb-0.5">Version</span>
						<span>{run.version}</span>
					</div>
					<div className="col-span-2 sm:col-span-1">
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
								<Badge
									key={query}
									variant="outline"
									className="h-auto max-w-full whitespace-normal text-left text-xs font-normal"
								>
									{query}
								</Badge>
							))}
						</div>
					</div>
				)}

				<div>
					<span className="text-xs text-muted-foreground block mb-1.5">Brands Mentioned</span>
					<MentionedBrands companies={companies} selected={selected} onSelect={setSelected} domainFor={domainFor} />
				</div>

				<div>
					<span className="text-xs text-muted-foreground block mb-1.5">LLM Response</span>
					<div ref={answerRef} className="rounded-md border bg-muted/30 p-4 max-h-64 overflow-auto">
						<ResponseMarkdown highlight={highlight} markRange={markRange}>
							{text}
						</ResponseMarkdown>
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

interface MentionedCompany {
	name: string;
	isBrand: boolean;
	record?: MentionAssessment;
	sentiment?: Sentiment;
	passage: { start: number; end: number } | null;
}

/** The brand first, then competitors in the order the answer names them. */
function mentionedCompanies(run: ResponseCardRun, text: string, brandName?: string): MentionedCompany[] {
	const company = (name: string, isBrand: boolean, record?: MentionAssessment): MentionedCompany => ({
		name,
		isBrand,
		record,
		sentiment: isSentiment(record?.sentiment) ? record.sentiment : undefined,
		passage: record ? passageRange(text, record) : null,
	});
	return [
		...(run.brandMentioned && brandName ? [company(brandName, true, run.mentionAssessments?.brand)] : []),
		...[...new Set(run.competitorsMentioned ?? [])].map((name) =>
			company(name, false, run.mentionAssessments?.competitors[name]),
		),
	];
}

const ordinal = (n: number) => {
	const suffix = ["th", "st", "nd", "rd"][n % 100 > 10 && n % 100 < 14 ? 0 : n % 10] ?? "th";
	return `${n}${suffix}`;
};

function badgeTip(company: MentionedCompany): string {
	const parts: string[] = [];
	if (company.record?.position) parts.push(`Named ${ordinal(company.record.position)} among the tracked companies.`);
	if (company.passage) parts.push("Click to mark the passage this rests on.");
	return parts.join(" ");
}

/**
 * A badge per company with its position and the answer's sentiment toward it. Clicking one marks the
 * passage its assessment rests on in the answer below; clicking it again clears the mark.
 */
function MentionedBrands({
	companies,
	selected,
	onSelect,
	domainFor,
}: {
	companies: MentionedCompany[];
	selected: string | null;
	onSelect: (name: string | null) => void;
	domainFor: (name: string) => string | undefined;
}) {
	if (companies.length === 0) return <span className="text-xs text-muted-foreground">None</span>;
	return (
		<div className="flex flex-wrap items-center gap-1.5">
			{companies.map((company) => {
				const { sentiment } = company;
				const canShow = company.passage !== null;
				const active = selected === company.name;
				const tip = badgeTip(company);
				const content = (
					<>
						<SiteIcon domain={domainFor(company.name)} size="xs" />
						{company.name}
						{company.record?.position !== undefined && (
							<span className="tabular-nums text-muted-foreground">#{company.record.position}</span>
						)}
						{sentiment && (
							<>
								<span className="h-3 w-px bg-border" />
								<span className={cn("font-medium", SENTIMENT_STYLES[sentiment].text)}>
									{SENTIMENT_STYLES[sentiment].label}
								</span>
							</>
						)}
					</>
				);
				const className = cn(
					"inline-flex h-6 items-center gap-1.5 rounded-md border px-2 text-xs transition-colors",
					company.isBrand && "border-foreground/30 font-medium",
				);
				// Only a badge with a passage to mark is a control; the rest are plain labels.
				if (!canShow) {
					return (
						<span key={company.name} title={tip || undefined} className={className}>
							{content}
						</span>
					);
				}
				return (
					<button
						key={company.name}
						type="button"
						aria-pressed={active}
						title={tip || undefined}
						onClick={() => onSelect(active ? null : company.name)}
						className={cn(
							className,
							"cursor-pointer hover:bg-muted/60",
							active && sentiment && cn("border-transparent", SENTIMENT_STYLES[sentiment].soft),
							active && !sentiment && "border-transparent bg-muted",
						)}
					>
						{content}
					</button>
				);
			})}
		</div>
	);
}

function passageMark(company?: MentionedCompany): MarkRange | undefined {
	if (!company?.passage) return undefined;
	const tint = company.sentiment ? SENTIMENT_STYLES[company.sentiment].soft : "bg-muted";
	return { ...company.passage, className: cn("rounded-sm px-0.5 text-inherit", tint) };
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
