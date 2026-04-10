import type { Provider } from "./types";

export const anthropicApi: Provider = {
	id: "anthropic-api",
	name: "Anthropic API",
	isConfigured: () => false,
	run: () => { throw new Error("not implemented"); },
};
