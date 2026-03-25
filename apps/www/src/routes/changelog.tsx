import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { Navbar } from "@/components/navbar";
import { Footer } from "@/components/footer";
import { ogMeta, canonicalUrl, breadcrumbJsonLd } from "@/lib/seo";
import type { GitHubIssue, GitHubRelease } from "@/lib/github";

const title = "Changelog — Elmo";
const description =
	"See what's new in Elmo. Track recent improvements, bug fixes, and completed features.";

interface ChangelogMonth {
	month: string;
	label: string;
	issues: Pick<GitHubIssue, "number" | "title" | "html_url" | "labels" | "closed_at">[];
}

interface ChangelogData {
	generatedAt: string;
	months: ChangelogMonth[];
	releases: GitHubRelease[];
	hasReleases: boolean;
}

export const Route = createFileRoute("/changelog")({
	head: () => ({
		meta: [
			{ title },
			{ name: "description", content: description },
			...ogMeta({ title, description, path: "/changelog" }),
		],
		links: [{ rel: "canonical", href: canonicalUrl("/changelog") }],
		scripts: [
			breadcrumbJsonLd([
				{ name: "Home", path: "/" },
				{ name: "Changelog", path: "/changelog" },
			]),
		],
	}),
	loader: async () => {
		const data = await getChangelogData();
		return data;
	},
	component: ChangelogPage,
});

const getChangelogData = createServerFn({ method: "GET" }).handler(
	async () => {
		const { readFileSync } = await import("node:fs");
		const { resolve } = await import("node:path");
		const filePath = resolve("src/data/changelog.json");
		const raw = readFileSync(filePath, "utf-8");
		return JSON.parse(raw) as ChangelogData;
	},
);

function LabelBadge({ name, color }: { name: string; color: string }) {
	return (
		<span
			className="inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium"
			style={{
				borderColor: `#${color}40`,
				backgroundColor: `#${color}15`,
				color: `#${color}`,
			}}
		>
			{name.replace("area/", "")}
		</span>
	);
}

function IssueRow({ issue }: { issue: ChangelogMonth["issues"][number] }) {
	return (
		<li>
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
					<div className="mt-0.5 flex flex-wrap items-center gap-1.5">
						<span className="text-xs text-muted-foreground">#{issue.number}</span>
						{issue.labels.map((label) => (
							<LabelBadge
								key={label.name}
								name={label.name}
								color={label.color}
							/>
						))}
					</div>
				</div>
				<svg
					width="16"
					height="16"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					strokeWidth="2"
					strokeLinecap="round"
					strokeLinejoin="round"
					className="shrink-0 text-muted-foreground transition-colors group-hover:text-primary"
				>
					<path d="M7 17L17 7" />
					<path d="M7 7h10v10" />
				</svg>
			</a>
		</li>
	);
}

function ReleaseCard({ release }: { release: GitHubRelease }) {
	return (
		<div className="rounded-lg border p-6">
			<div className="flex items-center gap-3">
				<h3 className="text-lg font-semibold">
					{release.name || release.tag_name}
				</h3>
				<span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
					{release.tag_name}
				</span>
				{release.prerelease && (
					<span className="rounded-full bg-yellow-100 px-2 py-0.5 text-xs font-medium text-yellow-800">
						Pre-release
					</span>
				)}
			</div>
			<p className="mt-1 text-sm text-muted-foreground">
				{new Date(release.published_at).toLocaleDateString("en-US", {
					month: "long",
					day: "numeric",
					year: "numeric",
				})}
			</p>
			{release.body && (
				<div className="prose prose-sm mt-4 max-w-none">
					<pre className="whitespace-pre-wrap text-sm">{release.body}</pre>
				</div>
			)}
			<a
				href={release.html_url}
				target="_blank"
				rel="noopener noreferrer"
				className="mt-3 inline-flex items-center gap-1 text-sm text-primary hover:underline"
			>
				View on GitHub
				<svg
					width="12"
					height="12"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					strokeWidth="2"
					strokeLinecap="round"
					strokeLinejoin="round"
				>
					<path d="M7 17L17 7" />
					<path d="M7 7h10v10" />
				</svg>
			</a>
		</div>
	);
}

function ChangelogPage() {
	const { months, releases, hasReleases, generatedAt } =
		Route.useLoaderData();

	return (
		<div className="min-h-screen">
			<Navbar />
			<main className="mx-auto max-w-3xl px-4 py-12 md:px-6 lg:py-20">
				<header className="mb-12 space-y-4">
					<h1 className="font-heading text-4xl lg:text-5xl">Changelog</h1>
					<p className="text-lg text-muted-foreground text-balance">
						{hasReleases
							? "Latest releases and updates to Elmo."
							: "Recent improvements and completed work. Release changelogs are coming soon."}
					</p>
					<div className="flex flex-wrap items-center gap-3">
						<a
							href="https://github.com/elmohq/elmo"
							target="_blank"
							rel="noopener noreferrer"
							className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
						>
							<svg
								viewBox="0 0 24 24"
								fill="currentColor"
								className="size-4"
							>
								<path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
							</svg>
							Follow on GitHub
						</a>
						{generatedAt && (
							<span className="text-xs text-muted-foreground">
								Updated{" "}
								{new Date(generatedAt).toLocaleDateString("en-US", {
									month: "short",
									day: "numeric",
									year: "numeric",
								})}
							</span>
						)}
					</div>
				</header>

				{hasReleases && (
					<section className="mb-16 space-y-6">
						<h2 className="text-2xl font-semibold">Releases</h2>
						{releases.map((release) => (
							<ReleaseCard key={release.id} release={release} />
						))}
					</section>
				)}

				<section>
					{!hasReleases && (
						<div className="mb-8 rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
							No published releases yet. Showing completed issues from GitHub.
						</div>
					)}
					<div className="space-y-10">
						{months.map((group) => (
							<div key={group.month}>
								<div className="mb-3 border-b pb-2">
									<h3 className="text-sm font-medium text-muted-foreground">
										{group.label}
									</h3>
								</div>
							<ul className="space-y-2">
								{group.issues.map((issue) => (
									<IssueRow key={issue.number} issue={issue} />
								))}
							</ul>
							</div>
						))}
					</div>
				</section>
			</main>
			<Footer />
		</div>
	);
}
