export const PROMPT_DETAIL_TABS = ["mentions", "web-queries", "citations", "responses"] as const;

export type PromptDetailTab = (typeof PROMPT_DETAIL_TABS)[number];
