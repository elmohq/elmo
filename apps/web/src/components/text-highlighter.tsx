"use client";

import { Fragment } from "react";

interface TextHighlighterProps {
	text: string;
	highlight: string;
	className?: string;
	highlightClassName?: string;
}

export function TextHighlighter({
	text,
	highlight,
	className = "",
	highlightClassName = "bg-yellow-200 dark:bg-yellow-800 rounded px-0.5",
}: TextHighlighterProps) {
	if (!highlight || highlight.trim() === "") {
		return <span className={className}>{text}</span>;
	}

	const escapedHighlight = highlight.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	const regex = new RegExp(`(${escapedHighlight})`, "gi");
	const parts = text.split(regex);

	return (
		<span className={className}>
			{parts.map((part, index) => {
				const isMatch = part.toLowerCase() === highlight.toLowerCase();
				return isMatch ? (
					<mark key={index} className={highlightClassName}>
						{part}
					</mark>
				) : (
					<Fragment key={index}>{part}</Fragment>
				);
			})}
		</span>
	);
}

