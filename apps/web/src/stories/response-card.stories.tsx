/**
 * Stories for <ResponseCard />, the answer card on the Responses page and the
 * prompt detail page, focused on the Evidence block: the passage behind each
 * mention verdict and the sentiment read from it.
 */
import type { Meta, StoryObj } from "@storybook/react";
import type { MentionAssessmentRecord } from "@workspace/lib/mentions";
import { ResponseCard, type ResponseCardRun } from "@/components/response-card";

const ANSWER = `For a small sales team, **Acme** is the easiest CRM to get running: setup takes an afternoon and the mobile app is genuinely good.

Globex is cheaper, but reviewers keep complaining about its clunky reporting and slow support.

If you need deep customization, Initech is worth a look, though it takes longer to configure.`;

const NEGATIVE_ANSWER = `Acme used to be the default pick, but recent reviews describe frequent outages and a support team that takes days to reply.

Most teams comparing CRMs now shortlist Globex instead.`;

const UNCERTAIN_ANSWER = `For reporting, some teams pair their CRM with Acme Insights, which adds dashboards on top of most pipelines.

Globex has reporting built in.`;

/** Offsets of `passage` in `text`, as the worker stores them. */
function evidence(passage: string, text = ANSWER): MentionAssessmentRecord["evidence"] {
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

const positiveBrand: MentionAssessmentRecord = {
	mention: "mentioned",
	probability: 0.98,
	sentiment: "positive",
	sentimentProbabilities: { positive: 0.91, neutral: 0.06, negative: 0.01, mixed: 0.02 },
	evidence: evidence("For a small sales team, **Acme** is the easiest CRM to get running"),
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
		run: { ...baseRun, mentionAssessments: { brand: positiveBrand } },
	},
} satisfies Meta<typeof ResponseCard>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The brand is praised; competitors that are plainly mentioned show no passage. */
export const PositiveBrand: Story = {};

export const NegativeBrand: Story = {
	args: {
		text: NEGATIVE_ANSWER,
		run: {
			...baseRun,
			rawOutput: { text: NEGATIVE_ANSWER },
			competitorsMentioned: ["Globex"],
			mentionAssessments: {
				brand: {
					mention: "mentioned",
					probability: 0.97,
					sentiment: "negative",
					sentimentProbabilities: { positive: 0.03, neutral: 0.08, negative: 0.86, mixed: 0.03 },
					evidence: evidence(
						"Acme used to be the default pick, but recent reviews describe frequent outages and a support team that takes days to reply.",
						NEGATIVE_ANSWER,
					),
				},
			},
		},
	},
};

/** The model couldn't call it either way: it still counts as a mention, and the tone is unclear. */
export const UncertainBrand: Story = {
	args: {
		text: UNCERTAIN_ANSWER,
		run: {
			...baseRun,
			rawOutput: { text: UNCERTAIN_ANSWER },
			competitorsMentioned: ["Globex"],
			mentionAssessments: {
				brand: {
					mention: "uncertain",
					probability: 0.55,
					reason: "other_company",
					sentiment: "uncertain",
					sentimentProbabilities: { positive: 0.4, neutral: 0.45, negative: 0.1, mixed: 0.05 },
					evidence: evidence(
						"For reporting, some teams pair their CRM with Acme Insights, which adds dashboards on top of most pipelines.",
						UNCERTAIN_ANSWER,
					),
				},
			},
		},
	},
};

/** A competitor whose name was used for a different company isn't counted, and its passage says why. */
export const CompetitorNotCounted: Story = {
	args: {
		run: {
			...baseRun,
			competitorsMentioned: ["Globex"],
			mentionAssessments: {
				brand: positiveBrand,
				competitors: {
					Globex: { mention: "mentioned", probability: 0.96, sentiment: "negative", position: 2 },
					Initech: {
						mention: "not_mentioned",
						probability: 0.08,
						reason: "other_company",
						evidence: evidence(
							"If you need deep customization, Initech is worth a look, though it takes longer to configure.",
						),
					},
				},
			},
		},
	},
};

/** Runs matched by substring, or whose text wasn't stored, have no verdicts and show no Evidence block. */
export const NotJudged: Story = {
	args: { run: { ...baseRun, mentionAssessments: null } },
};
