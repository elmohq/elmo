export function hasFrontmatter(markdown: string): boolean {
	return /^﻿?---\r?\n[\s\S]*?\r?\n---\r?\n/.test(markdown);
}

export function codeFencesBalanced(markdown: string): boolean {
	let open: string | undefined;
	for (const line of markdown.split(/\r?\n/)) {
		const fence = line.match(/^\s{0,3}(`{3,}|~{3,})/)?.[1];
		if (!fence) continue;
		if (!open) open = fence;
		else if (fence[0] === open[0] && fence.length >= open.length) open = undefined;
	}
	return open === undefined;
}

export interface MarkdownLink {
	text: string;
	url: string;
}

export function markdownLinks(markdown: string): MarkdownLink[] {
	return [...markdown.matchAll(/\[([^\]]+)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)].map((match) => ({
		text: match[1] as string,
		url: match[2] as string,
	}));
}

export function llmsTxtShape(text: string): { h1: boolean; summary: boolean; linkItems: number } {
	const lines = text.split(/\r?\n/).filter((line) => line.trim() !== "");
	return {
		h1: /^#\s+\S/.test(lines[0] ?? ""),
		summary: lines.some((line) => line.startsWith(">")),
		linkItems: lines.filter((line) => /^\s*[-*]\s+\[[^\]]+\]\([^)]+\)/.test(line)).length,
	};
}

export function looksLikeHtml(body: string): boolean {
	return /^\s*(<!doctype html|<html[\s>])/i.test(body);
}

export function estimateTokens(text: string): number {
	return Math.ceil(text.length / 4);
}
