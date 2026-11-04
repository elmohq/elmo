import { IconCheck, IconCopy } from "@tabler/icons-react";
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "@workspace/ui/components/input-group";
import { cn } from "@workspace/ui/lib/utils";
import { useEffect, useState } from "react";

export function CopyButton({ value, label, className }: { value: string; label?: string; className?: string }) {
	const [copied, setCopied] = useState(false);

	useEffect(() => {
		if (!copied) return;
		const timer = setTimeout(() => setCopied(false), 2_000);
		return () => clearTimeout(timer);
	}, [copied]);

	return (
		<InputGroupButton
			size="icon-xs"
			className={className}
			aria-label={copied ? "Copied" : label ? `Copy ${label}` : "Copy"}
			onClick={() => {
				navigator.clipboard.writeText(value);
				setCopied(true);
			}}
		>
			{copied ? <IconCheck /> : <IconCopy />}
		</InputGroupButton>
	);
}

export function CopyField({ value, label, className }: { value: string; label: string; className?: string }) {
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
				<CopyButton value={value} label={label} />
			</InputGroupAddon>
		</InputGroup>
	);
}
