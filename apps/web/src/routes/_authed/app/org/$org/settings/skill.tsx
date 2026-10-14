import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { orgLinkParams } from "@workspace/lib/app-urls";
import { CodeBlock, InlineCode } from "@/components/code-block";
import { useOrganization } from "@/hooks/use-organizations";
import { pageHead } from "@/lib/route-head";

const INSTALL_COMMAND = "npx skills add elmohq/elmo";
const SKILL_URL = "https://github.com/elmohq/elmo/tree/main/skills/aeo";
const LAUNCH_POST_URL = "https://www.elmohq.com/blog/aeo-skill";

const EXAMPLE_ASKS = [
	"How's our brand doing in AI search this week?",
	"Why did our Google AI Overviews visibility drop last month?",
	"Audit our site's access for AI crawlers and fix what's blocking them.",
	"Which pages do the engines cite when we lose, and how do we get onto them?",
];

export const Route = createFileRoute("/_authed/app/org/$org/settings/skill")({
	staticData: { crumb: "Skill" },
	beforeLoad: ({ context }) => {
		if (context.clientConfig?.mode === "whitelabel") {
			throw notFound();
		}
	},
	head: pageHead({ description: "Install the aeo skill for Claude Code, Cursor, Codex, and other agents." }),
	component: SkillPage,
});

function SkillPage() {
	const linkParams = orgLinkParams(useOrganization());

	return (
		<div className="max-w-4xl space-y-8">
			<header className="space-y-1">
				<h1 className="text-3xl font-bold">Skill</h1>
				<p className="max-w-2xl text-muted-foreground">
					The <InlineCode>aeo</InlineCode> skill teaches Claude Code, Cursor, Codex, and other coding agents an
					evidence-based answer engine optimization workflow: measure, diagnose, fix, then measure again.
				</p>
			</header>

			<section className="space-y-3">
				<h2 className="text-lg font-semibold">Install</h2>
				<CodeBlock code={INSTALL_COMMAND} />
				<p className="text-sm text-muted-foreground">
					The skills CLI finds the agents on your machine and installs the skill for each. To install by hand, copy{" "}
					<a href={SKILL_URL} target="_blank" rel="noreferrer" className="underline underline-offset-4">
						skills/aeo
					</a>{" "}
					into your agent's skills directory.
				</p>
			</section>

			<section className="space-y-3">
				<h2 className="text-lg font-semibold">Connect it to your data</h2>
				<p className="text-sm text-muted-foreground">
					With this deployment connected over{" "}
					<Link to="/app/org/$org/settings/mcp" params={linkParams} className="underline underline-offset-4">
						MCP
					</Link>
					, the agent reads your tracked visibility, citations, and fan-out queries instead of guessing. Without it, the
					skill falls back to sampling answers by hand.
				</p>
			</section>

			<section className="space-y-3">
				<h2 className="text-lg font-semibold">Try asking</h2>
				<ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
					{EXAMPLE_ASKS.map((ask) => (
						<li key={ask}>{ask}</li>
					))}
				</ul>
			</section>

			<p className="text-sm text-muted-foreground">
				The skill is MIT-licensed.{" "}
				<a href={LAUNCH_POST_URL} target="_blank" rel="noreferrer" className="underline underline-offset-4">
					Read how it compares with other AEO skills
				</a>
				.
			</p>
		</div>
	);
}
