/** Bundled for the browser: never import server-only code here (auth providers, auth0, react-start/server). */
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

export function getOptimizeButtonForMode(mode: ClientConfig["mode"]): OptimizeButtonComponent {
	return OPTIMIZE_BUTTON_BY_MODE[mode];
}
