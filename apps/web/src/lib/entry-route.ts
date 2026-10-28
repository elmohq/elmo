import type { DeploymentMode } from "@workspace/config/types";

export type EntryRoute = "/auth/login" | "/auth/register";

interface EntryConfig {
	mode: DeploymentMode;
	canRegister: boolean;
	hasUsers: boolean;
}

export function entryRouteForVisitor(config: EntryConfig | undefined): EntryRoute | null {
	if (!config || config.mode === "whitelabel") return null;
	if (config.canRegister && (config.mode === "cloud" || !config.hasUsers)) return "/auth/register";
	return "/auth/login";
}
