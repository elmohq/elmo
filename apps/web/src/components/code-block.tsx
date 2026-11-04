import type { ReactNode } from "react";
import { CopyButton } from "@/components/copy-button";

export function CodeBlock({ code }: { code: string }) {
	return (
		<div className="relative">
			<pre className="overflow-x-auto rounded-md border bg-muted/40 px-3 pt-3 pb-2 pr-10 text-xs leading-relaxed">
				<code>{code}</code>
			</pre>
			<CopyButton value={code} className="absolute right-2.5 top-2.25 text-muted-foreground" />
		</div>
	);
}

export function InlineCode({ children }: { children: ReactNode }) {
	return <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">{children}</code>;
}
