/**
 * OptimizeButton stub for local/demo deployments
 * 
 * The optimize functionality is only available in whitelabel mode.
 * This stub returns null to prevent any rendering in local/demo modes.
 */

export interface OptimizeButtonProps {
	brandId?: string;
	selectedModel?: "openai" | "anthropic" | "google" | "all";
	availableModels?: ("openai" | "anthropic" | "google")[];
	promptName?: string;
	promptId?: string;
	// Branding configuration (required in whitelabel, optional in stub)
	parentName?: string;
	optimizationUrlTemplate?: string;
}

export function OptimizeButton(_props: OptimizeButtonProps) {
	return null;
}
