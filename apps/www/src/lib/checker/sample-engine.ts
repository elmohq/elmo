import type { Answer, BrandProfile } from "./openai";

/**
 * Canned answers for local development without an OpenAI key, so the page can
 * be built and screenshotted end to end. Results are flagged as samples in the
 * UI; production never falls back to this.
 */

const RIVALS = ["Northwind", "Globex", "Initech", "Umbrella", "Hooli"];

function titleCase(domain: string): string {
	const stem = domain.split(".")[0] ?? domain;
	return stem.charAt(0).toUpperCase() + stem.slice(1);
}

// Roughly the real engine's pacing, so the progress UI can be worked on locally.
const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function sampleProfile(input: {
	domain: string;
	brandName?: string;
	category?: string;
}): Promise<BrandProfile> {
	await pause(1200);
	const category = input.category || "project management software";
	return {
		brandName: input.brandName || titleCase(input.domain),
		aliases: [],
		category,
		prompts: [
			`What is the best ${category} for small teams?`,
			`${category} with the best free plan in 2026`,
			`Alternatives to ${RIVALS[0]} for a growing startup`,
			`Which ${category} integrates with Slack and Google Workspace?`,
			`Most affordable ${category} for agencies`,
		],
	};
}

export async function sampleAnswer(
	prompt: string,
	index: number,
	brand: { name: string; domain: string },
): Promise<Answer> {
	await pause(1500 + index * 700);
	const rivals = RIVALS.slice(index % 2, (index % 2) + 3);
	const brandLine =
		index % 3 === 0
			? `- **${brand.name}**: a strong pick if you want something simple that scales. See ${brand.domain}.`
			: index % 3 === 1
				? ""
				: `- ${brand.name}: worth a look, though reviewers mention a learning curve.`;
	const lines = rivals.map((rival) => `- **${rival}**: popular, with a generous free tier and good integrations.`);
	if (brandLine) lines.splice(index % 3 === 0 ? 0 : 2, 0, brandLine);
	return {
		text: `Here are some good options for "${prompt}":\n\n${lines.join("\n")}`,
		sources: [
			{
				url: "https://www.g2.com/categories/project-management",
				domain: "g2.com",
				title: "Best Project Management Software",
			},
			{ url: "https://www.reddit.com/r/projectmanagement/", domain: "reddit.com", title: "r/projectmanagement" },
			...(index % 3 === 0
				? [{ url: `https://${brand.domain}/pricing`, domain: brand.domain, title: `${brand.name} pricing` }]
				: []),
		],
	};
}

export function sampleBrandNames(answers: string[]): string[][] {
	return answers.map((answer) => [...answer.matchAll(/^- \*{0,2}([^*:]+)\*{0,2}:/gm)].map((match) => match[1].trim()));
}
