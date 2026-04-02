/**
 * Stories for the Prompt Details header meta row.
 *
 * These stories are used for deterministic before/after screenshots for issue #101.
 */
import type { Meta } from "@storybook/react";
import { PromptDetailsHeaderMeta } from "@/components/prompt-details-header-meta";

export default {
	title: "Prompt Details/Header Meta",
} satisfies Meta;

const baseProps = {
	brandId: "default",
	enabled: true,
	systemTags: ["branded"],
	userTags: ["monitoring"],
};

/** Before (#101): no Next run shown */
export const Before = () => {
	return <PromptDetailsHeaderMeta {...baseProps} nextRunAt={null} />;
};

/** After (#101): Next run shown and fits header design */
export const After = () => {
	const nextRunAt = new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString();
	return <PromptDetailsHeaderMeta {...baseProps} nextRunAt={nextRunAt} />;
};

