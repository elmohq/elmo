import { IconInfoCircle } from "@tabler/icons-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@workspace/ui/components/card";
import { Separator } from "@workspace/ui/components/separator";
import { Skeleton } from "@workspace/ui/components/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@workspace/ui/components/tooltip";
import { SiteIcon } from "@/components/site-icon";
import { type CitationFilters, useCitationChannels } from "@/hooks/use-citations";
import { type ChannelMix, OWNED_CHANNEL } from "@/lib/citation-channels";

type Channel = ChannelMix["channels"][number];
type Subject = ChannelMix["subjects"][number];

const HEAT_RGB = "37, 99, 235";
/** Below this many citations a channel's rates are too noisy to shade at full strength. */
const FULL_SHADE_CITATIONS = 20;

function heatStyle(rate: number, channelCitations: number) {
	const confidence = Math.min(1, channelCitations / FULL_SHADE_CITATIONS);
	return { backgroundColor: `rgba(${HEAT_RGB}, ${(0.5 * rate * confidence).toFixed(2)})` };
}

const formatShare = (count: number, total: number) => {
	if (total === 0) return "0%";
	const share = (count / total) * 100;
	return share > 0 && share < 1 ? "<1%" : `${Math.round(share)}%`;
};

const subjectLabel = (subject: Subject) => (subject.kind === "brand" ? "You" : subject.name);

const ZERO = <span className="text-muted-foreground/60">0</span>;

function RateCell({ subject, channel }: { subject: Subject; channel: Channel }) {
	const citations = channel.bySubject[subject.id] ?? 0;
	if (citations === 0) return <td className="px-2 py-1.5 text-center tabular-nums">{ZERO}</td>;
	const counts = `${citations.toLocaleString()} of ${channel.citations.toLocaleString()}`;
	return (
		<td
			className="rounded border-x border-transparent bg-clip-padding px-2 py-1.5 text-center tabular-nums"
			style={heatStyle(citations / channel.citations, channel.citations)}
		>
			<Tooltip>
				<TooltipTrigger render={<span className="cursor-default" />}>
					{formatShare(citations, channel.citations)}
				</TooltipTrigger>
				<TooltipContent className="max-w-xs text-xs font-normal">
					{channel.key === OWNED_CHANNEL
						? `${counts} Own Website citations point to ${subject.kind === "brand" ? "your" : `${subject.name}'s`} domains`
						: `${counts} ${channel.label} citations came from answers that mention ${subject.kind === "brand" ? "you" : subject.name}`}
				</TooltipContent>
			</Tooltip>
		</td>
	);
}

function ChannelMixSkeleton() {
	return (
		<Card>
			<CardHeader>
				<Skeleton className="h-5 w-28" />
				<Skeleton className="h-4 w-96 max-w-full" />
			</CardHeader>
			<Separator />
			<CardContent className="space-y-2">
				{["a", "b", "c", "d", "e", "f"].map((row) => (
					<Skeleton key={row} className="h-8 w-full" />
				))}
			</CardContent>
		</Card>
	);
}

/** Loads apart from the rest of the page, so joining citations to mentions never holds the page up. */
export function RemoteChannelMixCard({ source }: { source?: { brandId: string; filters?: CitationFilters } }) {
	const query = useCitationChannels(source);
	if (query.isLoading) return <ChannelMixSkeleton />;
	if (!query.data || query.data.channels.length === 0) return null;
	return (
		<div className={`transition-opacity ${query.isPlaceholderData ? "opacity-60" : ""}`}>
			<ChannelMixCard channelMix={query.data} />
		</div>
	);
}

function ChannelMixCard({ channelMix }: { channelMix: ChannelMix }) {
	const { subjects, channels, overall, totalCitations } = channelMix;

	return (
		<Card>
			<CardHeader>
				<CardTitle className="flex items-center gap-1.5">
					Channels
					<Tooltip>
						<TooltipTrigger render={<IconInfoCircle className="h-3.5 w-3.5 text-muted-foreground cursor-help" />} />
						<TooltipContent className="max-w-xs text-sm font-normal">
							Each cell is the share of a channel&apos;s citations that came from answers mentioning that company.
							Compare a row with All Channels to see where a company shows up more or less than usual. Own Website is
							the share of citations pointing to each company&apos;s own domains. Use the model filter to see one AI
							ecosystem at a time.
						</TooltipContent>
					</Tooltip>
				</CardTitle>
				<CardDescription>
					How often answers citing each channel mention you and your competitors, compared with all channels
				</CardDescription>
			</CardHeader>
			<Separator />
			<CardContent>
				<div className="overflow-x-auto">
					<table
						className="w-full table-fixed border-separate border-spacing-x-0 border-spacing-y-0.5 text-sm"
						style={{ minWidth: `${22 + subjects.length * 5.5}rem` }}
					>
						<colgroup>
							<col className="w-44" />
							<col className="w-36" />
						</colgroup>
						<thead>
							<tr className="text-xs text-muted-foreground">
								<th className="pb-2 pl-2 text-left font-medium">Channel</th>
								<th className="pb-2 pr-3 text-right font-medium whitespace-nowrap">
									<span className="inline-flex items-center gap-1">
										Channel Total
										<Tooltip>
											<TooltipTrigger render={<IconInfoCircle className="h-3 w-3 cursor-help" />} />
											<TooltipContent className="max-w-xs text-xs font-normal">
												Every citation to a source in this channel, whether or not the answer mentions a tracked
												company, and its share of all citations.
											</TooltipContent>
										</Tooltip>
									</span>
								</th>
								{subjects.map((subject) => (
									<th key={subject.id} className="px-2 pb-2 font-medium">
										<span className="flex items-center justify-center gap-1.5">
											<SiteIcon domain={subject.domain} size="xs" />
											<span className="truncate">{subjectLabel(subject)}</span>
										</span>
									</th>
								))}
							</tr>
						</thead>
						<tbody>
							<tr className="font-semibold [&>td]:bg-muted">
								<td className="rounded-l-md py-2 pr-3 pl-2 whitespace-nowrap">All Channels</td>
								<td className="py-2 pr-3 text-right whitespace-nowrap tabular-nums">
									{totalCitations.toLocaleString()}
									<span className="ml-1.5 inline-block w-9" />
								</td>
								{subjects.map((subject) => (
									<td key={subject.id} className="px-2 py-2 text-center tabular-nums last:rounded-r-md">
										{formatShare(overall[subject.id] ?? 0, totalCitations)}
									</td>
								))}
							</tr>
							{channels.map((channel) => (
								<tr key={channel.key}>
									<td className="py-1.5 pr-3 pl-2 font-medium whitespace-nowrap">{channel.label}</td>
									<td className="py-1.5 pr-3 text-right whitespace-nowrap tabular-nums">
										{channel.citations.toLocaleString()}
										<span className="ml-1.5 inline-block w-9 text-xs text-muted-foreground">
											{formatShare(channel.citations, totalCitations)}
										</span>
									</td>
									{subjects.map((subject) => (
										<RateCell key={subject.id} subject={subject} channel={channel} />
									))}
								</tr>
							))}
						</tbody>
					</table>
				</div>
			</CardContent>
		</Card>
	);
}
