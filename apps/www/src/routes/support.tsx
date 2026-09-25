import { createFileRoute } from "@tanstack/react-router";
import { bookDemoUrl } from "@workspace/config/referrals";
import { buttonVariants } from "@workspace/ui/components/button";
import { Spinner } from "@workspace/ui/components/spinner";
import { ArrowUpRight } from "lucide-react";
import { type ReactNode, useState } from "react";
import { Footer } from "@/components/footer";
import { Navbar } from "@/components/navbar";
import { openCrispChat } from "@/lib/crisp";
import { externalRel } from "@/lib/external-link";
import { breadcrumbJsonLd, canonicalUrl, ogMeta } from "@/lib/seo";

const title = "Support · Elmo";
const description = "Get help with Elmo: chat with the team, email support, book a call, or ask the community.";

const SUPPORT_EMAIL = "contact@elmohq.com";
const SECURITY_EMAIL = "security@elmohq.com";
const DISCORD_INVITE_URL = "https://discord.gg/s24nubCtKz";
const GITHUB_ISSUES_URL = "https://github.com/elmohq/elmo/issues";
const CLOUD_STATUS_URL = "https://status.elmohq.com/";

export const Route = createFileRoute("/support")({
	head: () => ({
		meta: [
			{ title },
			{ name: "description", content: description },
			...ogMeta({ title, description, path: "/support" }),
		],
		links: [{ rel: "canonical", href: canonicalUrl("/support") }],
		scripts: [
			breadcrumbJsonLd([
				{ name: "Home", path: "/" },
				{ name: "Support", path: "/support" },
			]),
		],
	}),
	component: SupportPage,
});

function ContactCard({ heading, body, action }: { heading: string; body: string; action: ReactNode }) {
	return (
		<div className="flex flex-col rounded-md border border-zinc-200 bg-white p-6">
			<h2 className="text-lg font-semibold text-zinc-950">{heading}</h2>
			<p className="mt-2 flex-1 text-sm text-zinc-600">{body}</p>
			<div className="mt-5">{action}</div>
		</div>
	);
}

// Stops a click that's still waiting on Crisp from spinning forever if the event never comes.
const CHAT_OPEN_TIMEOUT_MS = 15_000;

function StartChatButton() {
	const [opening, setOpening] = useState(false);

	function start() {
		setOpening(true);
		const timeout = window.setTimeout(() => setOpening(false), CHAT_OPEN_TIMEOUT_MS);
		openCrispChat(() => {
			window.clearTimeout(timeout);
			setOpening(false);
		});
	}

	return (
		<button
			type="button"
			onClick={start}
			disabled={opening}
			className={buttonVariants({ variant: "default", size: "sm" })}
		>
			{opening && <Spinner />}
			{opening ? "Opening chat…" : "Start a chat"}
		</button>
	);
}

function ExternalButton({ href, children }: { href: string; children: ReactNode }) {
	return (
		<a
			href={href}
			target="_blank"
			rel={externalRel(href)}
			className={buttonVariants({ variant: "outline", size: "sm" })}
		>
			{children}
			<ArrowUpRight className="size-3.5" />
		</a>
	);
}

function ResourceLink({ href, label, detail }: { href: string; label: string; detail: string }) {
	const external = href.startsWith("http");
	return (
		<a
			href={href}
			{...(external ? { target: "_blank", rel: externalRel(href) } : {})}
			className="group flex items-start justify-between gap-4 rounded-md border border-zinc-200 bg-white p-4 transition-colors hover:bg-zinc-50"
		>
			<div>
				<p className="text-sm font-medium text-zinc-950 group-hover:text-blue-600">{label}</p>
				<p className="mt-1 text-xs text-zinc-500">{detail}</p>
			</div>
			{external && <ArrowUpRight className="size-4 shrink-0 text-zinc-400" />}
		</a>
	);
}

function SupportPage() {
	return (
		<div className="min-h-screen">
			<Navbar />
			<main className="mx-auto max-w-6xl px-4 py-12 md:px-6 lg:py-20">
				<header className="mb-16 space-y-4">
					<p className="font-mono text-[11px] uppercase tracking-[0.18em] text-zinc-500">/ SUPPORT</p>
					<h1 className="font-heading text-4xl text-zinc-950 lg:text-5xl">Support</h1>
					<p className="max-w-2xl text-lg text-balance text-zinc-600">
						Questions about your account, billing, the MCP server, or self-hosting Elmo? Here is how to reach us.
					</p>
				</header>

				<section className="mb-16 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
					<ContactCard
						heading="Chat with us"
						body="The fastest way to reach the team, for anything from sign-in trouble to questions about your data."
						action={<StartChatButton />}
					/>
					<ContactCard
						heading="Email"
						body="For account, billing, and anything that needs a longer answer. Include your organization name if you use Elmo Cloud."
						action={
							<a href={`mailto:${SUPPORT_EMAIL}`} className={buttonVariants({ variant: "outline", size: "sm" })}>
								{SUPPORT_EMAIL}
							</a>
						}
					/>
					<ContactCard
						heading="Book a call"
						body="Walk through your setup, your prompts, or what the results mean with someone from the team."
						action={<ExternalButton href={bookDemoUrl("marketing-support")}>Book a time</ExternalButton>}
					/>
					<ContactCard
						heading="Community"
						body="Ask other Elmo users and the team on Discord, especially about self-hosting and integrations."
						action={<ExternalButton href={DISCORD_INVITE_URL}>Join Discord</ExternalButton>}
					/>
					<ContactCard
						heading="Bugs and feature requests"
						body="Elmo is open source. Report bugs and request features on GitHub, where you can follow the fix."
						action={<ExternalButton href={GITHUB_ISSUES_URL}>Open an issue</ExternalButton>}
					/>
					<ContactCard
						heading="Security"
						body="Report vulnerabilities privately by email rather than in a public issue."
						action={
							<a href={`mailto:${SECURITY_EMAIL}`} className={buttonVariants({ variant: "outline", size: "sm" })}>
								{SECURITY_EMAIL}
							</a>
						}
					/>
				</section>

				<section>
					<h2 className="mb-6 text-xl font-semibold text-zinc-950">Before you write</h2>
					<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
						<ResourceLink href="/docs" label="Documentation" detail="Setup, features, and self-hosting guides." />
						<ResourceLink
							href="/docs/api/mcp"
							label="MCP server"
							detail="Connecting Elmo to ChatGPT, Claude, Cursor, and other clients."
						/>
						<ResourceLink href={CLOUD_STATUS_URL} label="Elmo Cloud status" detail="Current uptime and incidents." />
						<ResourceLink href="/status" label="Provider status" detail="How each AI provider integration is doing." />
					</div>
				</section>
			</main>
			<Footer />
		</div>
	);
}
