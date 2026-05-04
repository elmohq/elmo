/**
 * Stories for the brand-onboarding wizard. Cover the meaningful UI states:
 *   - Idle (the analyze button before the user clicks it).
 *   - Analyzing (the in-flight loader, simulated with a long mock delay).
 *   - Review (every section populated, prompts pre-tagged).
 *   - Analyze error (the wizard surfaces the message inline).
 *
 * The mocks live in src/stories/_mocks; the storybook alias in
 * .storybook/main.ts swaps `@/server/onboarding` for the mock at bundle time.
 */
import { useEffect } from "react";
import type { Meta } from "@storybook/react";
import PromptWizard from "@/components/prompt-wizard";
import { setMockBrand } from "./_mocks/use-brands";
import {
	setMockOnboardingDelay,
	setMockOnboardingError,
	setMockOnboardingSuggestion,
} from "./_mocks/server-onboarding";
import type { OnboardingSuggestion } from "@workspace/lib/onboarding";

const RICH_SUGGESTION: OnboardingSuggestion = {
	brandName: "Acme",
	website: "acme.com",
	additionalDomains: ["acme.co.uk", "acme.de"],
	aliases: ["Acme Inc", "Acme Corporation"],
	products: ["widgets", "industrial supplies", "gadgets"],
	competitors: [
		{
			name: "Globex",
			domain: "globex.com",
			additionalDomains: ["globex.de"],
			aliases: ["Globex Corp"],
		},
		{
			name: "Initech",
			domain: "initech.com",
			additionalDomains: [],
			aliases: ["Initech Industries"],
		},
		{
			name: "Soylent",
			domain: "soylent.com",
			additionalDomains: [],
			aliases: [],
		},
	],
	suggestedPrompts: [
		{ prompt: "best widgets", tags: ["best-of"] },
		{ prompt: "best widgets for small business", tags: ["best-of", "use-case"] },
		{ prompt: "widgets vs alternatives", tags: ["comparison"] },
		{ prompt: "where to buy widgets", tags: ["transactional"] },
		{ prompt: "acme alternative", tags: ["alternative", "branded"] },
		{ prompt: "acme review", tags: ["informational", "branded"] },
		{ prompt: "is acme worth it", tags: ["informational", "branded"] },
		{ prompt: "best industrial supplies for startups", tags: ["best-of", "persona"] },
		{ prompt: "globex vs acme", tags: ["comparison", "branded"] },
		{ prompt: "alternatives to globex", tags: ["alternative"] },
	],
};

const MOCK_BRAND = {
	id: "mock-brand-id",
	name: "Acme",
	website: "https://acme.com",
	prompts: [],
	competitors: [],
};

function useWizardSetup({
	brand,
	suggestion,
	delayMs = 0,
	error = null,
}: {
	brand: typeof MOCK_BRAND;
	suggestion: OnboardingSuggestion | null;
	delayMs?: number;
	error?: string | null;
}) {
	useEffect(() => {
		setMockBrand(brand);
		setMockOnboardingSuggestion(suggestion);
		setMockOnboardingDelay(delayMs);
		setMockOnboardingError(error);
		return () => {
			setMockOnboardingSuggestion(null);
			setMockOnboardingDelay(0);
			setMockOnboardingError(null);
		};
	}, [brand, suggestion, delayMs, error]);
}

export default {
	title: "Onboarding / Prompt wizard",
} satisfies Meta;

/**
 * Click the wizard's "Analyze brand" button after mount so the story lands on
 * the analyzing/review state. Stories that want to show the idle screen
 * simply omit this.
 */
function AutoAnalyze() {
	useEffect(() => {
		const id = window.setTimeout(() => {
			const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>("button"));
			const analyze = buttons.find((b) => /analyze brand/i.test(b.textContent ?? ""));
			analyze?.click();
		}, 0);
		return () => window.clearTimeout(id);
	}, []);
	return null;
}

/** Initial state — analyze button visible, no suggestion fetched yet. */
export const Idle = () => {
	useWizardSetup({ brand: MOCK_BRAND, suggestion: RICH_SUGGESTION });
	return <PromptWizard onComplete={() => {}} />;
};

/** In-flight — analyze is mocked to take 5s so the loader is visible. */
export const Analyzing = () => {
	useWizardSetup({ brand: MOCK_BRAND, suggestion: RICH_SUGGESTION, delayMs: 5_000 });
	return (
		<>
			<PromptWizard onComplete={() => {}} />
			<AutoAnalyze />
		</>
	);
};

/** Review with a fully-populated suggestion — every section editable. */
export const Review = () => {
	useWizardSetup({ brand: MOCK_BRAND, suggestion: RICH_SUGGESTION });
	return (
		<>
			<PromptWizard onComplete={() => {}} />
			<AutoAnalyze />
		</>
	);
};

/** Analyze fails (e.g. provider not configured) — the error renders inline. */
export const AnalyzeError = () => {
	useWizardSetup({
		brand: MOCK_BRAND,
		suggestion: RICH_SUGGESTION,
		error: "Onboarding requires at least one LLM provider. Configure ANTHROPIC_API_KEY or similar.",
	});
	return (
		<>
			<PromptWizard onComplete={() => {}} />
			<AutoAnalyze />
		</>
	);
};
