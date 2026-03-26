import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { ArrowUpRight, Plus, ThumbsUp, MessageCircle, CalendarClock } from "lucide-react";
import { Button } from "@workspace/ui/components/button";
import { Navbar } from "@/components/navbar";
import { Footer } from "@/components/footer";
import { ogMeta, canonicalUrl, breadcrumbJsonLd } from "@/lib/seo";

const title = "Roadmap — Elmo";
const description =
	"See what's coming next for Elmo. React or comment on GitHub issues to help prioritize.";

interface RoadmapIssue {
	number: number;
	title: string;
	html_url: string;
	labels: { name: string; color: string }[];
	milestone: { title: string; due_on: string | null } | null;
	created_at: string;
	reactions: number;
	comments: number;
	engagement: number;
}

interface AreaGroup {
	area: string;
	label: string;
	description: string;
	issues: RoadmapIssue[];
}

interface RoadmapData {
	generatedAt: string;
	groups: AreaGroup[];
	totalCount: number;
}

export const Route = createFileRoute("/roadmap")({
	head: () => ({
		meta: [
			{ title },
			{ name: "description", content: description },
			...ogMeta({ title, description, path: "/roadmap" }),
		],
		links: [{ rel: "canonical", href: canonicalUrl("/roadmap") }],
		scripts: [
			breadcrumbJsonLd([
				{ name: "Home", path: "/" },
				{ name: "Roadmap", path: "/roadmap" },
			]),
		],
	}),
	loader: async () => {
		const data = await getRoadmapData();
		return data;
	},
	component: RoadmapPage,
});

const getRoadmapData = createServerFn({ method: "GET" }).handler(async () => {
	const data = await import("../data/roadmap.json");
	return data.default as RoadmapData;
});

function EngagementBadge({ reactions, comments }: { reactions: number; comments: number }) {
	if (reactions === 0 && comments === 0) return null;

	return (
		<div className="flex shrink-0 items-center gap-2 text-xs tabular-nums text-muted-foreground">
			{reactions > 0 && (
				<span className="flex items-center gap-0.5" title={`${reactions} reaction${reactions !== 1 ? "s" : ""}`}>
					<ThumbsUp className="size-3" />
					{reactions}
				</span>
			)}
			{comments > 0 && (
				<span className="flex items-center gap-0.5" title={`${comments} comment${comments !== 1 ? "s" : ""}`}>
					<MessageCircle className="size-3" />
					{comments}
				</span>
			)}
		</div>
	);
}

function RoadmapIssueRow({ issue }: { issue: RoadmapIssue }) {
	const labels = issue.labels.filter((l) => !l.name.startsWith("area/"));

	return (
		<a
			href={issue.html_url}
			target="_blank"
			rel="noopener noreferrer"
			className="group flex items-center gap-3 rounded-lg border px-4 py-3 transition-colors hover:bg-muted/30"
		>
			<div className="min-w-0 flex-1">
				<span className="text-sm font-medium text-foreground group-hover:text-primary">
					{issue.title}
				</span>
				<div className="mt-0.5 flex flex-wrap items-center gap-2">
					<span className="text-xs text-muted-foreground">
						#{issue.number}
					</span>
					{labels.map((label) => (
						<span
							key={label.name}
							className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground"
						>
							{label.name}
						</span>
					))}
				</div>
			</div>
			{issue.milestone && (
				<span className="flex shrink-0 items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary" title={`Target: ${issue.milestone.title}`}>
					<CalendarClock className="size-3" />
					{issue.milestone.title}
				</span>
			)}
			<EngagementBadge reactions={issue.reactions} comments={issue.comments} />
			<ArrowUpRight className="size-4 shrink-0 text-muted-foreground transition-colors group-hover:text-primary" />
		</a>
	);
}

function AreaSection({ group }: { group: AreaGroup }) {
	return (
		<section>
			<div className="mb-4">
				<div className="flex items-center gap-3">
					<h2 className="text-xl font-semibold">{group.label}</h2>
					<span className="rounded-full bg-muted px-2 py-0.5 text-xs tabular-nums text-muted-foreground">
						{group.issues.length}
					</span>
				</div>
				<p className="mt-0.5 text-sm text-muted-foreground">
					{group.description}
				</p>
			</div>
			<div className="space-y-2">
				{group.issues.map((issue) => (
					<RoadmapIssueRow key={issue.number} issue={issue} />
				))}
			</div>
		</section>
	);
}

function RoadmapPage() {
	const { groups, totalCount, generatedAt } = Route.useLoaderData();

	return (
		<div className="min-h-screen">
			<Navbar />
			<main className="mx-auto max-w-4xl px-4 py-12 md:px-6 lg:py-20">
				<header className="mb-12 space-y-4">
					<h1 className="font-heading text-4xl lg:text-5xl">Roadmap</h1>
					<p className="text-lg text-muted-foreground text-balance">
						What we're working on and what's coming next.
					</p>
					<p className="text-sm text-muted-foreground">
						React with an emoji on GitHub to vote for an issue!
					</p>
					<div className="flex flex-wrap items-center gap-3">
						<Button asChild size="sm">
							<a
								href="https://github.com/elmohq/elmo/issues/new"
								target="_blank"
								rel="noopener noreferrer"
							>
								<Plus className="mr-1.5 size-4" />
								Request a Feature
							</a>
						</Button>
						<Button asChild variant="outline" size="sm">
							<a
								href="https://github.com/orgs/elmohq/projects/3/views/1"
								target="_blank"
								rel="noopener noreferrer"
							>
								View Project Board
								<ArrowUpRight className="ml-1.5 size-4" />
							</a>
						</Button>
						<span className="text-sm text-muted-foreground">
							{totalCount} open items
						</span>
						{generatedAt && (
							<span className="text-xs text-muted-foreground">
								· Updated{" "}
								{new Date(generatedAt).toLocaleDateString("en-US", {
									month: "short",
									day: "numeric",
									year: "numeric",
								})}
							</span>
						)}
					</div>
				</header>

				{groups.length > 0 ? (
					<div className="space-y-12">
						{groups.map((group: AreaGroup) => (
							<AreaSection key={group.area} group={group} />
						))}
					</div>
				) : (
					<p className="text-center text-muted-foreground">
						No open issues found. Check back soon!
					</p>
				)}

				<div className="mt-16 rounded-lg border border-dashed p-8 text-center">
					<h3 className="text-lg font-semibold">Have an idea?</h3>
					<p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
						We build Elmo in the open. Create a GitHub issue for feature
						requests, bug reports, or general feedback — and react or
						comment on existing issues to help us prioritize.
					</p>
					<div className="mt-4 flex flex-wrap items-center justify-center gap-3">
						<Button asChild>
							<a
								href="https://github.com/elmohq/elmo/issues/new"
								target="_blank"
								rel="noopener noreferrer"
							>
								<Plus className="mr-1.5 size-4" />
								Create an Issue
							</a>
						</Button>
					</div>
				</div>
			</main>
			<Footer />
		</div>
	);
}
