import { useI18n } from "@/lib/i18n";
import { IconInfoCircle } from "@tabler/icons-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@workspace/ui/components/tooltip";

/** A table column header with an info tooltip. Render inside a TooltipProvider. */
export function ColHead({ label, tip, right }: { label: string; tip: string; right?: boolean }) {
	const { t } = useI18n();
	return (
		<span className={`inline-flex items-center gap-1 ${right ? "w-full justify-end" : ""}`}>
			{t(label)}
			<Tooltip>
				<TooltipTrigger render={<span className="cursor-help text-muted-foreground/60" />}>
					<IconInfoCircle className="size-3.5" />
				</TooltipTrigger>
				<TooltipContent className="max-w-[240px] text-xs font-normal">{t(tip)}</TooltipContent>
			</Tooltip>
		</span>
	);
}
