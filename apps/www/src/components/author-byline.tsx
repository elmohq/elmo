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

function PostDates({ date, updated }: { date: string; updated?: string }) {
	const publishedLabel = formatPostDate(date);

	if (!updated) return <time dateTime={date}>{publishedLabel}</time>;

	return (
		<>
			Updated <time dateTime={updated}>{formatPostDate(updated)}</time>
			<span className="text-zinc-300"> · </span>
			Published <time dateTime={date}>{publishedLabel}</time>
		</>
	);
}

/**
 * Byline for a blog post. AI-generated posts (`author: "ai"`) show no author
 * information — just the post dates. Known team authors get a full byline, and
 * anything else falls back to a plain name. See src/data/authors.ts.
 */
export function AuthorByline({ author, date, updated }: { author: string; date: string; updated?: string }) {
	const resolved = resolveAuthor(author);

	if (resolved.kind === "ai") {
		return (
			<div className="not-prose text-sm text-zinc-500">
				<PostDates date={date} updated={updated} />
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
						<a href={url} target="_blank" rel="nofollow noopener noreferrer" className="hover:underline">
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
					<PostDates date={date} updated={updated} />
				</div>
			</div>
		</div>
	);
}
