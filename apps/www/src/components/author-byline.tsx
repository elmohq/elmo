import { Sparkles } from "lucide-react";
import { resolveAuthor, type TeamAuthor } from "@/data/authors";
import { formatPostDate } from "@/lib/format";

function initials(name: string): string {
	return name
		.split(/\s+/)
		.map((word) => word[0])
		.filter(Boolean)
		.slice(0, 2)
		.join("")
		.toUpperCase();
}

function InitialsAvatar({ name }: { name: string }) {
	return (
		<span
			aria-hidden
			className="flex size-9 shrink-0 items-center justify-center rounded-full bg-zinc-100 font-mono text-xs font-medium text-zinc-600"
		>
			{initials(name)}
		</span>
	);
}

function TeamAvatar({ author }: { author: TeamAuthor }) {
	if (author.avatar) {
		return <img src={author.avatar} alt={author.name} className="size-9 shrink-0 rounded-full object-cover" />;
	}
	return <InitialsAvatar name={author.name} />;
}

/**
 * Byline for a blog post. Renders an AI-generated badge (with a link to our AI
 * policy) for `author: "ai"`, a full team byline for known authors, and a
 * plain name for anything else. See src/data/authors.ts.
 */
export function AuthorByline({ author, date }: { author: string; date: string }) {
	const resolved = resolveAuthor(author);
	const dateLabel = formatPostDate(date);

	if (resolved.kind === "ai") {
		return (
			<div className="not-prose flex items-center gap-3">
				<span
					aria-hidden
					className="flex size-9 shrink-0 items-center justify-center rounded-full bg-blue-50 text-blue-600 ring-1 ring-inset ring-blue-100"
				>
					<Sparkles className="size-4" />
				</span>
				<div className="text-sm leading-tight">
					<div className="flex flex-wrap items-center gap-x-1.5 font-medium text-zinc-900">
						AI-generated
						<a
							href="/docs/developer-guide/ai-policy"
							className="font-normal text-zinc-500 underline-offset-2 hover:text-zinc-900 hover:underline"
						>
							How we use AI
						</a>
					</div>
					<time dateTime={date} className="text-zinc-500">
						{dateLabel}
					</time>
				</div>
			</div>
		);
	}

	const name = resolved.kind === "team" ? resolved.author.name : resolved.name;
	const role = resolved.kind === "team" ? resolved.author.role : undefined;
	const url = resolved.kind === "team" ? resolved.author.url : undefined;

	return (
		<div className="not-prose flex items-center gap-3">
			{resolved.kind === "team" ? <TeamAvatar author={resolved.author} /> : <InitialsAvatar name={name} />}
			<div className="text-sm leading-tight">
				<div className="font-medium text-zinc-900">
					{url ? (
						<a href={url} target="_blank" rel="noopener noreferrer" className="hover:underline">
							{name}
						</a>
					) : (
						name
					)}
				</div>
				<div className="text-zinc-500">
					{role ? (
						<>
							{role} <span className="text-zinc-300">·</span>{" "}
						</>
					) : null}
					<time dateTime={date}>{dateLabel}</time>
				</div>
			</div>
		</div>
	);
}
