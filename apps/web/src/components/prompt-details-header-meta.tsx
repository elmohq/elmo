import { Badge } from "@workspace/ui/components/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@workspace/ui/components/tooltip";
import { IconInfoCircle } from "@tabler/icons-react";
import { Link } from "@tanstack/react-router";

export type PromptDetailsHeaderMetaProps = {
	brandId: string;
	enabled: boolean;
	systemTags: string[];
	userTags: string[];
	nextRunAt?: string | null; // ISO string
};

function formatNextRun(dateIso: string): string {
	// Keep it compact and readable across locales/timezones.
	const d = new Date(dateIso);
	return d.toLocaleString(undefined, {
		month: "short",
		day: "2-digit",
		year: "numeric",
		hour: "numeric",
		minute: "2-digit",
		timeZoneName: "short",
	});
}

export function PromptDetailsHeaderMeta({
	brandId,
	enabled,
	systemTags,
	userTags,
	nextRunAt,
}: PromptDetailsHeaderMetaProps) {
	const hasTags = systemTags.length > 0 || userTags.length > 0;
	const hasNextRun = typeof nextRunAt === "string" && nextRunAt.length > 0;

	return (
		<div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
			{enabled ? (
				<span className="inline-flex items-center gap-1.5 text-green-700">
					<span className="relative flex h-2 w-2">
						<span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75" />
						<span className="relative inline-flex h-2 w-2 rounded-full bg-green-500" />
					</span>
					Active
				</span>
			) : (
				<span className="text-muted-foreground">Disabled</span>
			)}

			{hasNextRun && <span className="text-border">|</span>}

			{hasNextRun && (
				<div className="flex items-center gap-1.5">
					<span className="text-muted-foreground">Next run:</span>
					<span className="tabular-nums">{formatNextRun(nextRunAt!)}</span>
					<Tooltip>
						<TooltipTrigger asChild>
							<span className="inline-flex">
								<IconInfoCircle className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
							</span>
						</TooltipTrigger>
						<TooltipContent className="max-w-xs text-sm font-normal">
							<p>
								This is the next scheduled evaluation time for this prompt (based on the current queue state).
							</p>
						</TooltipContent>
					</Tooltip>
				</div>
			)}

			{hasTags && <span className="text-border">|</span>}

			{hasTags && (
				<div className="flex items-center gap-1.5">
					<span className="text-muted-foreground">Tags:</span>
					{systemTags.map((tag) => (
						<Badge key={`sys-${tag}`} variant="secondary" className="text-xs capitalize font-normal">
							{tag}
						</Badge>
					))}
					{userTags.map((tag) => (
						<Badge key={`usr-${tag}`} variant="outline" className="text-xs capitalize font-normal">
							{tag}
						</Badge>
					))}
				</div>
			)}

			<span className="text-border">|</span>

			<Link
				to="/app/$brand/settings/prompts"
				params={{ brand: brandId }}
				className="text-muted-foreground hover:text-foreground transition-colors underline underline-offset-2 decoration-muted-foreground/40 hover:decoration-foreground/40"
			>
				Edit prompts
			</Link>
		</div>
	);
}

