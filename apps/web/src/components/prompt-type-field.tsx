import { Button } from "@workspace/ui/components/button";
import { Popover, PopoverContent, PopoverTrigger } from "@workspace/ui/components/popover";
import { cn } from "@workspace/ui/lib/utils";
import { Check, Pin } from "lucide-react";
import { type ReactElement, useState } from "react";

export function promptTypeLabel(branded: boolean): string {
	return branded ? "Branded" : "Unbranded";
}

/**
 * The three states of `brandedOverride`. `selected` is undefined when several
 * prompts with different settings are being changed at once; `detected` is
 * omitted for the same reason, since detection differs per prompt.
 */
export function PromptTypeMenu({
	trigger,
	selected,
	detected,
	onSelect,
	align = "start",
}: {
	trigger: ReactElement;
	selected?: boolean | null;
	detected?: boolean;
	onSelect: (override: boolean | null) => void;
	align?: "start" | "end";
}) {
	const [open, setOpen] = useState(false);
	const options: { value: boolean | null; label: string; hint: string }[] = [
		{
			value: null,
			label: "Detect automatically",
			hint:
				detected === undefined
					? "Branded when the prompt names the brand"
					: `Currently ${promptTypeLabel(detected).toLowerCase()}`,
		},
		{ value: true, label: "Always branded", hint: "Even if it doesn't name the brand" },
		{ value: false, label: "Always unbranded", hint: "Even if it names the brand" },
	];

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger render={trigger} />
			<PopoverContent align={align} className="w-64 space-y-0.5 p-1">
				{options.map((option) => (
					<button
						type="button"
						key={String(option.value)}
						onClick={() => {
							onSelect(option.value);
							setOpen(false);
						}}
						className="flex w-full cursor-pointer items-start gap-2 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent"
					>
						<Check className={cn("mt-0.5 size-4 shrink-0", selected === option.value ? "opacity-100" : "opacity-0")} />
						<span className="flex flex-col">
							<span>{option.label}</span>
							<span className="text-xs text-muted-foreground">{option.hint}</span>
						</span>
					</button>
				))}
			</PopoverContent>
		</Popover>
	);
}

/** One prompt's type as a button that opens the override menu. A pinned type
 *  shows a pin so it reads differently from a detected one. */
export function PromptTypeField({
	override,
	detected,
	onChange,
	className,
}: {
	override: boolean | null;
	detected: boolean;
	onChange: (override: boolean | null) => void;
	className?: string;
}) {
	const branded = override ?? detected;
	const pinned = override !== null;
	const label = promptTypeLabel(branded);

	return (
		<PromptTypeMenu
			selected={override}
			detected={detected}
			onSelect={onChange}
			trigger={
				<Button
					type="button"
					variant="outline"
					size="sm"
					className={cn("h-8 justify-between gap-1 px-2 font-normal", !pinned && "text-muted-foreground", className)}
					aria-label={`Type: ${label}${pinned ? ", set manually" : ", detected"}`}
				>
					{label}
					{pinned && <Pin className="size-3" />}
				</Button>
			}
		/>
	);
}
