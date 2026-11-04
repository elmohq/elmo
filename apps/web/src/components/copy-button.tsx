import { IconCheck, IconCopy } from "@tabler/icons-react";
import { Button } from "@workspace/ui/components/button";
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "@workspace/ui/components/input-group";
import { cn } from "@workspace/ui/lib/utils";
import { useEffect, useState } from "react";

function useCopy(value: string) {
	const [copied, setCopied] = useState(false);

	useEffect(() => {
		if (!copied) return;
		const timer = setTimeout(() => setCopied(false), 2_000);
		return () => clearTimeout(timer);
	}, [copied]);

	const copy = () => {
		navigator.clipboard.writeText(value);
		setCopied(true);
	};

	return { copied, copy };
}

/** Omit `label` for an icon-only button. */
export function CopyButton({ value, label, className }: { value: string; label?: string; className?: string }) {
	const { copied, copy } = useCopy(value);

	return (
		<Button type="button" variant="outline" size={label ? "default" : "icon"} className={className} onClick={copy}>
			{copied ? <IconCheck className="size-4" /> : <IconCopy className="size-4" />}
			{label ? copied ? "Copied" : label : <span className="sr-only">{copied ? "Copied" : "Copy"}</span>}
		</Button>
	);
}

export function CopyField({ value, label, className }: { value: string; label: string; className?: string }) {
	const { copied, copy } = useCopy(value);

	return (
		<InputGroup className={cn("bg-background", className)}>
			<InputGroupInput
				readOnly
				value={value}
				aria-label={label}
				className="font-mono text-sm"
				onFocus={(event) => event.currentTarget.select()}
			/>
			<InputGroupAddon align="inline-end">
				<InputGroupButton size="icon-xs" onClick={copy} aria-label={copied ? "Copied" : `Copy ${label}`}>
					{copied ? <IconCheck /> : <IconCopy />}
				</InputGroupButton>
			</InputGroupAddon>
		</InputGroup>
	);
}
