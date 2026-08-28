import { MAX_SLUG_LENGTH } from "@workspace/lib/app-urls";
import { Input } from "@workspace/ui/components/input";
import { Label } from "@workspace/ui/components/label";
import { cn } from "@workspace/ui/lib/utils";

/**
 * The URL segment something is reachable at, as a field in the form that owns
 * it rather than a form of its own.
 *
 * It saves with the name beside it, because they are the same edit: a person
 * renaming a brand means to rename the brand, not to file two changes. The
 * page that submits it is the one that knows the address moved, so it is the
 * page that navigates afterwards.
 *
 * The prefix is shown inside the field's border so the whole address reads, and
 * the input carries no border of its own to keep that one box.
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
	/** The part of the URL before the segment, shown so the whole address reads. */
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
					className="border-0 pl-0 font-mono text-sm shadow-none focus-visible:ring-0"
				/>
			</div>
		</div>
	);
}
