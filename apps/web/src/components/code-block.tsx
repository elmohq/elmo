import type { ReactNode } from "react";
import { CopyButton } from "@/components/copy-button";

export function CodeBlock({ code }: { code: string }) {
	return (
		<div className="relative">
			<pre className="overflow-x-auto rounded-md border bg-muted/40 p-3 pr-16 text-xs leading-relaxed">
				<code>{code}</code>
			</pre>
			<CopyButton value={code} className="absolute right-2 top-2" />
		</div>
	);
}

export function InlineCode({ children }: { children: ReactNode }) {
	return <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">{children}</code>;
}
