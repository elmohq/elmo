import { MAX_SLUG_LENGTH } from "@workspace/lib/app-urls";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@workspace/ui/components/input-group";
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
			<InputGroup className={cn("font-mono", className)}>
				<InputGroupAddon className="pr-0 font-mono font-normal">{prefix}</InputGroupAddon>
				<InputGroupInput
					id={id}
					value={value}
					onChange={(e) => onChange(e.target.value)}
					disabled={disabled}
					maxLength={MAX_SLUG_LENGTH}
					className={cn("pl-0! font-mono text-sm", disabled && "text-muted-foreground disabled:opacity-100")}
				/>
			</InputGroup>
		</div>
	);
}
