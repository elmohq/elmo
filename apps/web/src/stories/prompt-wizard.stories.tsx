/**
 * The storybook alias in .storybook/main.ts swaps `@/server/onboarding` and
 * `@/server/brands` for the mocks in src/stories/_mocks at bundle time.
 */

import type { Meta, StoryObj } from "@storybook/react";
import type { OnboardingSuggestion } from "@workspace/lib/onboarding";
import { useEffect } from "react";
import { expect, userEvent, waitFor, within } from "storybook/test";
import BrandOnboarding from "@/components/brand-onboarding";
import PromptWizard from "@/components/prompt-wizard";
import { setMockOnboardingPlatformState } from "./_mocks/server-brands";
import {
	setMockOnboardingDelay,
	setMockOnboardingError,
	setMockOnboardingSuggestion,
} from "./_mocks/server-onboarding";
import { setMockBrand } from "./_mocks/use-brands";

const RICH_SUGGESTION: OnboardingSuggestion = {
	brandName: "Acme",
	website: "acme.com",
	additionalDomains: ["acme.co.uk", "acme.de"],
	aliases: ["Acme Inc", "Acme Corporation"],
	competitors: [
		{ name: "Globex", domains: ["globex.com", "globex.de"], aliases: ["Globex Corp"] },
		{ name: "Initech", domains: ["initech.com"], aliases: ["Initech Industries"] },
		{ name: "Soylent", domains: ["soylent.com"], aliases: [] },
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

/**
 * The platform-state mock is set during render (not in an effect): the
 * component fetches it on mount, and child effects run before the story's
 * own would.
 */
export const Setup = () => {
	setMockOnboardingPlatformState(null);
	return <BrandOnboarding brandId="mock-brand-id" brandName="Acme" platformState={null} />;
};

const CLOUD_PLATFORM_STATE = {
	available: [
		{ model: "chatgpt", provider: "openai", webSearch: true },
		{ model: "google-ai-overview", provider: "dataforseo", webSearch: true },
		{ model: "copilot", provider: "dataforseo", webSearch: true },
		{ model: "perplexity", provider: "openrouter", webSearch: true },
		{ model: "gemini", provider: "openrouter", webSearch: false },
	],
	platformPicks: 4,
	defaultSelected: ["chatgpt", "google-ai-overview", "copilot", "perplexity"],
};

/**
 * Cloud plans insert a platform-selection step between the website form and
 * brand creation: plan defaults pre-selected, extra options disabled at the
 * pick limit.
 */
export const SetupPlatformStep: StoryObj = {
	render: () => {
		setMockOnboardingPlatformState(CLOUD_PLATFORM_STATE);
		return <BrandOnboarding brandId="mock-brand-id" brandName="Acme" platformState={CLOUD_PLATFORM_STATE} />;
	},
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);

		await userEvent.type(await canvas.findByLabelText("Website"), "acme.com");
		await userEvent.click(await canvas.findByRole("button", { name: /continue/i }));

		expect(await canvas.findByRole("checkbox", { name: /chatgpt/i })).toBeChecked();
		// Gemini is the fifth option on a 4-pick plan: unchecked and disabled.
		const gemini = canvas.getByRole("checkbox", { name: /gemini/i });
		expect(gemini).not.toBeChecked();
		expect(gemini).toHaveAttribute("aria-disabled", "true");
		expect(canvas.getByText("4 of 4 selected")).toBeInTheDocument();
		expect(canvas.getByRole("button", { name: /complete setup/i })).toBeEnabled();
	},
};

/**
 * A single-platform menu (Starter) shows the pick locked in rather than a
 * one-checkbox chooser.
 */
export const SetupSinglePlatformPlan: StoryObj = {
	render: () => {
		const state = {
			available: [{ model: "chatgpt", provider: "openai", webSearch: true }],
			platformPicks: 1,
			defaultSelected: ["chatgpt"],
		};
		setMockOnboardingPlatformState(state);
		return <BrandOnboarding brandId="mock-brand-id" brandName="Acme" platformState={state} />;
	},
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);

		await userEvent.type(await canvas.findByLabelText("Website"), "acme.com");
		await userEvent.click(await canvas.findByRole("button", { name: /continue/i }));

		const checkbox = await canvas.findByRole("checkbox", { name: /chatgpt/i });
		expect(checkbox).toBeChecked();
		expect(checkbox).toHaveAttribute("aria-disabled", "true");
		expect(canvas.getByRole("button", { name: /complete setup/i })).toBeEnabled();
	},
};

export const Idle = () => {
	useWizardSetup({ brand: MOCK_BRAND, suggestion: RICH_SUGGESTION });
	return <PromptWizard onComplete={() => {}} />;
};

/** Analyze is mocked to take 5s so the loader stays visible. */
export const Analyzing = () => {
	useWizardSetup({ brand: MOCK_BRAND, suggestion: RICH_SUGGESTION, delayMs: 5_000 });
	return (
		<>
			<PromptWizard onComplete={() => {}} />
			<AutoAnalyze />
		</>
	);
};

export const Review: StoryObj = {
	render: () => {
		useWizardSetup({ brand: MOCK_BRAND, suggestion: RICH_SUGGESTION });
		return (
			<>
				<PromptWizard onComplete={() => {}} />
				<AutoAnalyze />
			</>
		);
	},
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		await expect(await canvas.findByDisplayValue("Acme")).toBeVisible();
		await expect(canvas.getAllByDisplayValue("best widgets").length).toBeGreaterThan(0);
		await expect(
			canvas.getByRole("button", { name: `Start tracking (${RICH_SUGGESTION.suggestedPrompts.length} new prompts)` }),
		).toBeEnabled();
	},
};

/**
 * The provider/stack detail stays server-side and is never forwarded to the
 * browser, so the wizard shows a generic message.
 */
export const AnalyzeError: StoryObj = {
	render: () => {
		useWizardSetup({
			brand: MOCK_BRAND,
			suggestion: RICH_SUGGESTION,
			error: "Brand analysis failed. Please try again.",
		});
		return (
			<>
				<PromptWizard onComplete={() => {}} />
				<AutoAnalyze />
			</>
		);
	},
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		await expect(await canvas.findByText("Brand analysis failed. Please try again.")).toBeVisible();
		await expect(canvas.getByRole("button", { name: /analyze brand/i })).toBeEnabled();
	},
};

export const Cancel: StoryObj = {
	render: () => {
		useWizardSetup({ brand: MOCK_BRAND, suggestion: RICH_SUGGESTION, delayMs: 60_000 });
		return <PromptWizard onComplete={() => {}} />;
	},
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);

		await userEvent.click(await canvas.findByRole("button", { name: /analyze brand/i }));

		await userEvent.click(await canvas.findByRole("button", { name: /^cancel$/i }));

		await waitFor(() => {
			expect(canvas.getByRole("button", { name: /analyze brand/i })).toBeEnabled();
		});
		expect(canvas.queryByRole("button", { name: /^cancel$/i })).toBeNull();
	},
};
