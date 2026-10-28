import { IconCheck, IconCopy } from "@tabler/icons-react";
import { Button } from "@workspace/ui/components/button";
import { useEffect, useState } from "react";

/** Omit `label` for an icon-only button. */
export function CopyButton({ value, label, className }: { value: string; label?: string; className?: string }) {
	const [copied, setCopied] = useState(false);

	useEffect(() => {
		if (!copied) return;
		const timer = setTimeout(() => setCopied(false), 2_000);
		return () => clearTimeout(timer);
	}, [copied]);

	return (
		<Button
			type="button"
			variant="outline"
			size={label ? "default" : "icon"}
			className={className}
			onClick={() => {
				navigator.clipboard.writeText(value);
				setCopied(true);
			}}
		>
			{copied ? <IconCheck className="size-4" /> : <IconCopy className="size-4" />}
			{label ? copied ? "Copied" : label : <span className="sr-only">{copied ? "Copied" : "Copy"}</span>}
		</Button>
	);
}
