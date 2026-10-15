/**
 * Stories for <ResponseCard />, the answer card on the Responses page and the
 * prompt detail page, focused on the mentioned-company badges: each one's
 * position and sentiment, and the passage it rests on, marked when it's clicked.
 */
import type { Meta, StoryObj } from "@storybook/react";
import type { MentionAssessment } from "@workspace/lib/mentions";
import { expect, userEvent, within } from "storybook/test";
import { ResponseCard, type ResponseCardRun } from "@/components/response-card";

const ANSWER = `For a small sales team, **Acme** is the easiest CRM to get running: setup takes an afternoon and the mobile app is genuinely good.

Globex is cheaper, but reviewers keep complaining about its clunky reporting and slow support.

If you need deep customization, Initech is worth a look, though it takes longer to configure.`;

const NEGATIVE_ANSWER = `Acme used to be the default pick, but recent reviews describe frequent outages and a support team that takes days to reply.

Most teams comparing CRMs now shortlist Globex instead.`;

const DOUBTFUL_ANSWER = `For reporting, some teams pair their CRM with Acme Insights, which adds dashboards on top of most pipelines.

Globex has reporting built in.`;

/** What the worker stores beside each assessment; the card reads none of it. */
const JUDGED = { brand: "acme", competitors: {} };

/** Offsets of `passage` in `text`, as the worker stores them. */
function passageAt(passage: string, text = ANSWER): MentionAssessment["passage"] {
	const start = text.indexOf(passage);
	return { start, end: start + passage.length };
}

const baseRun: ResponseCardRun = {
	model: "chatgpt",
	version: "gpt-5",
	createdAt: "2026-06-04T09:12:00.000Z",
	webQueries: ["best crm for small sales team"],
	brandMentioned: true,
	competitorsMentioned: ["Globex", "Initech"],
	rawOutput: { text: ANSWER },
	mentionAssessments: null,
};

const positiveBrand: MentionAssessment = {
	mentioned: true,
	probability: 0.98,
	sentiment: "positive",
	sentimentProbabilities: { positive: 0.91, neutral: 0.06, negative: 0.01, mixed: 0.02 },
	passage: passageAt("For a small sales team, **Acme** is the easiest CRM to get running"),
	firstMention: ANSWER.indexOf("Acme"),
	mentionCount: 1,
	position: 1,
};

const meta = {
	title: "Components/ResponseCard",
	component: ResponseCard,
	decorators: [
		(Story) => (
			<div className="max-w-3xl">
				<Story />
			</div>
		),
	],
	args: {
		text: ANSWER,
		brandName: "Acme",
		domainFor: (name: string) => `${name.toLowerCase()}.com`,
		run: { ...baseRun, mentionAssessments: { brand: positiveBrand, competitors: {}, judged: JUDGED } },
	},
} satisfies Meta<typeof ResponseCard>;

export default meta;
type Story = StoryObj<typeof meta>;

const withCompetitors = {
	brand: positiveBrand,
	competitors: {
		Globex: {
			mentioned: true,
			probability: 0.96,
			sentiment: "negative",
			passage: passageAt(
				"Globex is cheaper, but reviewers keep complaining about its clunky reporting and slow support.",
			),
			position: 2,
		},
		Initech: {
			mentioned: true,
			probability: 0.93,
			sentiment: "mixed",
			passage: passageAt(
				"If you need deep customization, Initech is worth a look, though it takes longer to configure.",
			),
			position: 3,
		},
	},
	judged: JUDGED,
} satisfies ResponseCardRun["mentionAssessments"];

/** Each company's badge carries its position and the answer's sentiment toward it; nothing is marked until one is clicked. */
export const PositiveBrand: Story = {
	args: { run: { ...baseRun, mentionAssessments: withCompetitors } },
};

/** Clicking a badge marks the passage its assessment rests on, in that sentiment's colour; clicking again clears it. */
export const PassageMarked: Story = {
	args: { run: { ...baseRun, mentionAssessments: withCompetitors } },
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		const globex = canvas.getByRole("button", { name: /Globex/ });
		await userEvent.click(globex);
		await expect(globex).toHaveAttribute("aria-pressed", "true");
		const marked = canvasElement.querySelector("mark");
		await expect(marked?.textContent).toContain("clunky reporting");
	},
};

export const NegativeBrand: Story = {
	args: {
		text: NEGATIVE_ANSWER,
		run: {
			...baseRun,
			rawOutput: { text: NEGATIVE_ANSWER },
			competitorsMentioned: ["Globex"],
			mentionAssessments: {
				brand: {
					mentioned: true,
					probability: 0.97,
					sentiment: "negative",
					sentimentProbabilities: { positive: 0.03, neutral: 0.08, negative: 0.86, mixed: 0.03 },
					passage: passageAt(
						"Acme used to be the default pick, but recent reviews describe frequent outages and a support team that takes days to reply.",
						NEGATIVE_ANSWER,
					),
				},
				competitors: {},
				judged: JUDGED,
			},
		},
	},
};

/** The model couldn't call it either way: it still counts as a mention, with its likeliest sentiment. */
export const DoubtfulBrand: Story = {
	args: {
		text: DOUBTFUL_ANSWER,
		run: {
			...baseRun,
			rawOutput: { text: DOUBTFUL_ANSWER },
			competitorsMentioned: ["Globex"],
			mentionAssessments: {
				brand: {
					mentioned: true,
					probability: 0.55,
					sentiment: "neutral",
					sentimentProbabilities: { positive: 0.4, neutral: 0.45, negative: 0.1, mixed: 0.05 },
					passage: passageAt(
						"For reporting, some teams pair their CRM with Acme Insights, which adds dashboards on top of most pipelines.",
						DOUBTFUL_ANSWER,
					),
				},
				competitors: {},
				judged: JUDGED,
			},
		},
	},
};

/** A competitor whose name was used for a different company isn't counted, so it gets no badge. */
export const CompetitorNotCounted: Story = {
	args: {
		run: {
			...baseRun,
			competitorsMentioned: ["Globex"],
			mentionAssessments: {
				brand: positiveBrand,
				competitors: {
					Globex: { mentioned: true, probability: 0.96, sentiment: "negative", position: 2 },
					Initech: {
						mentioned: false,
						probability: 0.08,
						reason: "other_company",
						passage: passageAt(
							"If you need deep customization, Initech is worth a look, though it takes longer to configure.",
						),
					},
				},
				judged: JUDGED,
			},
		},
	},
};

/** Runs matched by name before the judge, or whose text wasn't stored, have no assessments: badges show no sentiment and mark nothing. */
export const NotJudged: Story = {
	args: { run: { ...baseRun, mentionAssessments: null } },
};
