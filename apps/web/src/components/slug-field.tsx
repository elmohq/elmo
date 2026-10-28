import { MAX_SLUG_LENGTH } from "@workspace/lib/app-urls";
import { Input } from "@workspace/ui/components/input";
import { Label } from "@workspace/ui/components/label";
import { cn } from "@workspace/ui/lib/utils";

export function SlugField({
	id,
	label,
	prefix,
	value,
	onChange,
	disabled = false,
	className,
}: {
	id: string;
	label: string;
	prefix: string;
	value: string;
	onChange: (value: string) => void;
	disabled?: boolean;
	className?: string;
}) {
	return (
		<div className="space-y-2">
			<Label htmlFor={id}>{label}</Label>
			<div className={cn("flex w-full items-center overflow-hidden rounded-md border font-mono text-sm", className)}>
				<span className="shrink-0 whitespace-nowrap pl-3 text-muted-foreground">{prefix}</span>
				<Input
					id={id}
					value={value}
					onChange={(e) => onChange(e.target.value)}
					disabled={disabled}
					maxLength={MAX_SLUG_LENGTH}
					className={cn(
						"border-0 pl-0 font-mono text-sm shadow-none focus-visible:ring-0",
						disabled && "text-muted-foreground disabled:opacity-100",
					)}
				/>
			</div>
		</div>
	);
}
