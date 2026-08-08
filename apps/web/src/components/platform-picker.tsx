import { IconWorld, IconWorldOff } from "@tabler/icons-react";
import { getModelMeta } from "@workspace/lib/providers/models";
import { Checkbox } from "@workspace/ui/components/checkbox";
import { Tooltip, TooltipContent, TooltipTrigger } from "@workspace/ui/components/tooltip";
import { cn } from "@workspace/ui/lib/utils";
import { useId } from "react";
import { iconForModel } from "@/components/filter-bar";

type PlatformOption = {
	model: string;
	provider: string;
	version?: string;
	webSearch: boolean;
};

interface PlatformPickerProps {
	options: PlatformOption[];
	selected: Set<string>;
	/** Receives the whole next selection; the picker owns what a toggle means. */
	onSelectedChange: (next: Set<string>) => void;
	/** Unchecked options disable once this many are selected; null = no limit. */
	limit: number | null;
	disabled?: boolean;
	className?: string;
}

export function PlatformPicker({
	options,
	selected,
	onSelectedChange,
	limit,
	disabled = false,
	className,
}: PlatformPickerProps) {
	const idPrefix = useId();

	const toggle = (model: string, checked: boolean) => {
		const next = new Set(selected);
		if (checked) next.add(model);
		else next.delete(model);
		onSelectedChange(next);
	};

	return (
		<div className={cn("grid gap-2 sm:grid-cols-2 lg:grid-cols-3", className)}>
			{options.map((option) => {
				const checked = selected.has(option.model);
				const atLimit = !checked && limit !== null && selected.size >= limit;
				const checkboxId = `${idPrefix}-${option.model}`;
				return (
					<label
						key={option.model}
						htmlFor={checkboxId}
						className={`flex items-center gap-3 rounded-md border p-3 ${
							atLimit ? "opacity-50" : "cursor-pointer hover:bg-accent/50"
						}`}
					>
						<Checkbox
							id={checkboxId}
							checked={checked}
							disabled={atLimit || disabled}
							onCheckedChange={(value) => toggle(option.model, value === true)}
						/>
						{iconForModel(option.model, "h-5 w-5")}
						<span className="flex-1 text-sm font-medium">{getModelMeta(option.model).label}</span>
						<Tooltip>
							<TooltipTrigger asChild>
								{option.webSearch ? (
									<IconWorld className="h-4 w-4 text-muted-foreground" />
								) : (
									<IconWorldOff className="h-4 w-4 text-muted-foreground" />
								)}
							</TooltipTrigger>
							<TooltipContent className="max-w-xs text-xs">
								{option.provider}
								{option.version ? ` · ${option.version}` : ""} · {option.webSearch ? "web search" : "no web search"}
							</TooltipContent>
						</Tooltip>
					</label>
				);
			})}
		</div>
	);
}
