import { MAX_SLUG_LENGTH } from "@workspace/lib/app-urls";
import { Input } from "@workspace/ui/components/input";
import { Label } from "@workspace/ui/components/label";
import { cn } from "@workspace/ui/lib/utils";

/**
 * A field of the form that owns it, not a form of its own: renaming a thing and
 * moving its URL are one edit, and the submitting page is what navigates after.
 */
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
	/** Rendered inside the field's border, so the whole address reads as one. */
	prefix: string;
	value: string;
	onChange: (value: string) => void;
	disabled?: boolean;
	className?: string;
}) {
	return (
		<div className="space-y-2">
			<Label htmlFor={id}>{label}</Label>
			<div className={cn("flex items-center rounded-md border font-mono text-sm", className)}>
				<span className="pl-3 text-muted-foreground">{prefix}</span>
				<Input
					id={id}
					value={value}
					onChange={(e) => onChange(e.target.value)}
					disabled={disabled}
					maxLength={MAX_SLUG_LENGTH}
					className={cn(
						"border-0 pl-0 font-mono text-sm shadow-none focus-visible:ring-0",
						// Read-only, so the segment matches the prefix instead of standing out
						// as the editable part.
						disabled && "text-muted-foreground disabled:opacity-100",
					)}
				/>
			</div>
		</div>
	);
}
