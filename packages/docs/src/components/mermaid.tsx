"use client";

import { useEffect, useRef, useState } from "react";

let mermaidPromise: Promise<typeof import("mermaid")> | null = null;

function getMermaid() {
	if (!mermaidPromise) {
		mermaidPromise = import("mermaid").then((mod) => {
			mod.default.initialize({
				startOnLoad: false,
				theme: "neutral",
				fontFamily: "inherit",
				flowchart: {
					htmlLabels: true,
					curve: "basis",
					padding: 16,
				},
			});
			return mod;
		});
	}
	return mermaidPromise;
}

let idCounter = 0;

interface MermaidProps {
	chart: string;
}

export function Mermaid({ chart }: MermaidProps) {
	const containerRef = useRef<HTMLDivElement>(null);
	const [svg, setSvg] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		const id = `mermaid-${++idCounter}`;

		getMermaid()
			.then(async (mod) => {
				const { svg: rendered } = await mod.default.render(id, chart);
				setSvg(rendered);
			})
			.catch((err) => {
				setError(err instanceof Error ? err.message : "Failed to render diagram");
			});
	}, [chart]);

	if (error) {
		return (
			<pre className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
				{error}
			</pre>
		);
	}

	if (!svg) {
		return (
			<div className="flex items-center justify-center rounded-lg border bg-muted/30 py-12 text-sm text-muted-foreground">
				Loading diagram...
			</div>
		);
	}

	return (
		<div
			ref={containerRef}
			className="my-6 flex justify-center overflow-x-auto rounded-lg border bg-white p-6 [&_svg]:max-w-full"
			dangerouslySetInnerHTML={{ __html: svg }}
		/>
	);
}
