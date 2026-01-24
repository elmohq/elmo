/**
 * OptimizeButton stub for local/demo deployments
 * 
 * The optimize functionality is only available in whitelabel mode.
 * This stub returns null to prevent any rendering in local/demo modes.
 */

export interface OptimizeButtonProps {
	brandId?: string;
	webSearchEnabled?: boolean;
	selectedModel?: "openai" | "anthropic" | "google" | "all";
	availableModels?: ("openai" | "anthropic" | "google")[];
	promptName?: string;
	promptId?: string;
	prompts?: Array<{ id: string; value: string }>;
	groupName?: string;
	groupPrefix?: string;
	webQueryMapping?: Record<string, string>;
	modelWebQueryMappings?: Record<string, Record<string, string>>;
}

export function OptimizeButton(_props: OptimizeButtonProps) {
	return null;
}
