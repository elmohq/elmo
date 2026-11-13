import { IconChevronDown, IconInfoCircle } from "@tabler/icons-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@workspace/ui/components/card";
import { Separator } from "@workspace/ui/components/separator";
import { Tooltip, TooltipContent, TooltipTrigger } from "@workspace/ui/components/tooltip";
import { Fragment, useState } from "react";
import { formatUrlForDisplay } from "@/components/citations/shared";
import { SiteIcon } from "@/components/site-icon";
import type { ChannelMix } from "@/lib/citation-channels";

type Channel = ChannelMix["channels"][number];

const HEAT_RGB = "37, 99, 235";

/** Shaded against the row's leader, so each row reads as who owns that channel. */
function heatStyle(citations: number, rowMax: number) {
	return { backgroundColor: `rgba(${HEAT_RGB}, ${(0.08 + 0.42 * (citations / rowMax)).toFixed(2)})` };
}

const formatShare = (count: number, total: number) => {
	if (total === 0) return "0%";
	const share = (count / total) * 100;
	return share > 0 && share < 1 ? "<1%" : `${Math.round(share)}%`;
};

const ZERO = <span className="text-muted-foreground/60">0</span>;

function ChannelPageRows({ channel, subjects }: { channel: Channel; subjects: ChannelMix["subjects"] }) {
	if (channel.topPages.length === 0) {
		return (
			<tr>
				<td colSpan={subjects.length + 2} className="py-2 pl-5 text-xs text-muted-foreground">
					No cited pages here name a tracked company.
				</td>
			</tr>
		);
	}
	return channel.topPages.map((page) => (
		<tr key={page.url} className="text-xs">
			<td className="max-w-0 py-1 pr-3 pl-5">
				<a
					href={page.url}
					target="_blank"
					rel="noopener noreferrer"
					className="block truncate text-muted-foreground hover:text-foreground hover:underline"
				>
					{page.title || formatUrlForDisplay(page.url)}
				</a>
			</td>
			<td className="py-1 pr-3 text-right whitespace-nowrap text-muted-foreground tabular-nums">
				{page.count.toLocaleString()}
				<span className="ml-1.5 inline-block w-9" />
			</td>
			{subjects.map((subject) => {
				const named = page.subjectIds.includes(subject.id);
				return (
					<td
						key={subject.id}
						className="rounded px-2 py-1 text-right tabular-nums"
						style={named ? { backgroundColor: `rgba(${HEAT_RGB}, 0.08)` } : undefined}
					>
						{named ? page.count.toLocaleString() : ZERO}
					</td>
				);
			})}
		</tr>
	));
}

function SubjectCell({
	subject,
	channel,
	rowMax,
}: {
	subject: ChannelMix["subjects"][number];
	channel: Channel;
	rowMax: number;
}) {
	const cell = channel.bySubject[subject.id];
	const citations = cell?.citations ?? 0;
	const pages = cell?.pages ?? 0;
	if (citations === 0) {
		return <td className="rounded px-2 py-1.5 text-right tabular-nums">{ZERO}</td>;
	}
	return (
		<td className="rounded px-2 py-1.5 text-right tabular-nums" style={heatStyle(citations, rowMax)}>
			<Tooltip>
				<TooltipTrigger render={<span className="cursor-default" />}>{citations.toLocaleString()}</TooltipTrigger>
				<TooltipContent className="text-xs font-normal">
					{subject.kind === "brand" ? "You" : subject.name} · {channel.label}: {citations.toLocaleString()}{" "}
					{citations === 1 ? "citation" : "citations"}
					{pages > 0 && ` across ${pages.toLocaleString()} ${pages === 1 ? "page" : "pages"}`} (
					{formatShare(citations, channel.citations)} of the channel)
				</TooltipContent>
			</Tooltip>
		</td>
	);
}

export function ChannelMixCard({ channelMix }: { channelMix?: ChannelMix }) {
	const [expanded, setExpanded] = useState<string | null>(null);
	if (!channelMix || channelMix.channels.length === 0) return null;
	const { subjects, channels, totalCitations } = channelMix;

	return (
		<Card>
			<CardHeader>
				<CardTitle className="flex items-center gap-1.5">
					Channels
					<Tooltip>
						<TooltipTrigger render={<IconInfoCircle className="h-3.5 w-3.5 text-muted-foreground cursor-help" />} />
						<TooltipContent className="max-w-xs text-sm font-normal">
							Citations on a company&apos;s own domains count toward Own Website. Everywhere else, a cited page counts
							for a company when its title or URL names it, so a comparison page can count for several. Each row is
							shaded against its leader. Use the model filter to see one AI ecosystem at a time.
						</TooltipContent>
					</Tooltip>
				</CardTitle>
				<CardDescription>
					Which channels AI models cite, and where you and your competitors show up in each
				</CardDescription>
			</CardHeader>
			<Separator />
			<CardContent>
				<div className="overflow-x-auto">
					<table className="w-full border-separate border-spacing-x-0.5 border-spacing-y-0.5 text-sm">
						<thead>
							<tr className="text-xs text-muted-foreground">
								<th className="w-full pb-2 text-left font-medium">Channel</th>
								<th className="pb-2 pr-3 text-right font-medium whitespace-nowrap">
									<span className="inline-flex items-center gap-1">
										Channel Total
										<Tooltip>
											<TooltipTrigger render={<IconInfoCircle className="h-3 w-3 cursor-help" />} />
											<TooltipContent className="max-w-xs text-xs font-normal">
												Every citation to a source in this channel, whether or not it involves a tracked company, and
												its share of all citations.
											</TooltipContent>
										</Tooltip>
									</span>
								</th>
								{subjects.map((subject) => (
									<th key={subject.id} className="min-w-24 px-2 pb-2 font-medium">
										<span className="flex items-center justify-end gap-1.5">
											<SiteIcon domain={subject.domain} size="xs" />
											<span className="max-w-28 truncate">{subject.kind === "brand" ? "You" : subject.name}</span>
										</span>
									</th>
								))}
							</tr>
						</thead>
						<tbody>
							{channels.map((channel) => {
								const isExpanded = expanded === channel.key;
								const rowMax = Math.max(0, ...subjects.map((s) => channel.bySubject[s.id]?.citations ?? 0));
								return (
									<Fragment key={channel.key}>
										<tr>
											<td className="py-1.5 pr-3">
												<button
													type="button"
													onClick={() => setExpanded(isExpanded ? null : channel.key)}
													aria-expanded={isExpanded}
													className="group flex cursor-pointer items-center gap-1.5 text-left"
												>
													<IconChevronDown
														className={`h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform ${isExpanded ? "" : "-rotate-90"}`}
													/>
													<span className="font-medium whitespace-nowrap group-hover:underline">{channel.label}</span>
												</button>
											</td>
											<td className="py-1.5 pr-3 text-right whitespace-nowrap tabular-nums">
												{channel.citations.toLocaleString()}
												<span className="ml-1.5 inline-block w-9 text-xs text-muted-foreground">
													{formatShare(channel.citations, totalCitations)}
												</span>
											</td>
											{subjects.map((subject) => (
												<SubjectCell key={subject.id} subject={subject} channel={channel} rowMax={rowMax} />
											))}
										</tr>
										{isExpanded && <ChannelPageRows channel={channel} subjects={subjects} />}
									</Fragment>
								);
							})}
						</tbody>
					</table>
				</div>
			</CardContent>
		</Card>
	);
}
