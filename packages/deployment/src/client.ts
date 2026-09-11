/**
 * Client-safe exports for deployment integration.
 *
 * IMPORTANT: This module must NEVER import server-only code (auth providers,
 * auth0, @tanstack/react-start/server, etc.). It is imported by client
 * components and route files that are bundled for the browser.
 */
import type { ClientConfig, OptimizeButtonProps } from "@workspace/config/types";
import { OptimizeButton, OptimizeButtonStub } from "./optimize-button";

export type { OptimizeButtonProps, WebQueryResult } from "@workspace/config/types";

type OptimizeButtonComponent = (props: OptimizeButtonProps) => ReturnType<typeof OptimizeButton>;

const OPTIMIZE_BUTTON_BY_MODE: Record<ClientConfig["mode"], OptimizeButtonComponent> = {
	local: OptimizeButtonStub,
	demo: OptimizeButtonStub,
	whitelabel: (props) =>
		OptimizeButton({
			...props,
			parentName: props.parentName ?? "",
			optimizationUrlTemplate: props.optimizationUrlTemplate ?? "",
		}),
	cloud: OptimizeButtonStub,
};

/**
 * Select the correct OptimizeButton component for the current deployment mode.
 */
export function getOptimizeButtonForMode(mode: ClientConfig["mode"]): OptimizeButtonComponent {
	return OPTIMIZE_BUTTON_BY_MODE[mode];
}
